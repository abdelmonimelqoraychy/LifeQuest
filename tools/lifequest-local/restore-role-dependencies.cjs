'use strict';

// Collects role references from pg_restore's SQL stream without retaining the
// dump text. COPY payloads (which can contain arbitrary user data) are skipped.
const fail = code => { throw Object.assign(new Error(code), { code }); };
const ignoredRoleTokens = new Set(['PUBLIC', 'CURRENT_USER', 'SESSION_USER', 'CURRENT_ROLE']);

function splitRoleList(value) {
  const roles = [];
  let token = '';
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') {
      token += ch;
      if (quoted && value[i + 1] === '"') { token += value[++i]; continue; }
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      roles.push(token.trim()); token = '';
    } else token += ch;
  }
  if (quoted) fail('RESTORE_ARCHIVE_ROLE_REFERENCE_UNSUPPORTED');
  if (token.trim()) roles.push(token.trim());
  return roles.map(item => {
    const role = item.trim();
    if (ignoredRoleTokens.has(role.toUpperCase())) return null;
    if (/^"(?:[^"]|"")+"$/.test(role)) return role.slice(1, -1).replaceAll('""', '"');
    if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(role)) return role;
    fail('RESTORE_ARCHIVE_ROLE_REFERENCE_UNSUPPORTED');
  }).filter(Boolean);
}

function maskSql(value) {
  let out = '';
  let single = false, lineComment = false, blockDepth = 0, dollarTag = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i], next = value[i + 1];
    if (lineComment) { out += ch === '\n' ? '\n' : ' '; if (ch === '\n') lineComment = false; continue; }
    if (blockDepth) {
      if (ch === '/' && next === '*') { out += '  '; i++; blockDepth++; }
      else if (ch === '*' && next === '/') { out += '  '; i++; blockDepth--; }
      else out += ch === '\n' ? '\n' : ' ';
      continue;
    }
    if (dollarTag) {
      if (value.startsWith(dollarTag, i)) { out += ' '.repeat(dollarTag.length); i += dollarTag.length - 1; dollarTag = null; }
      else { out += ch === '\n' ? '\n' : ' '; }
      continue;
    }
    if (single) {
      out += ch === '\n' ? '\n' : ' ';
      if (ch === "'" && next === "'") { out += ' '; i++; }
      else if (ch === "'") single = false;
      continue;
    }
    if (ch === '-' && next === '-') { out += '  '; i++; lineComment = true; continue; }
    if (ch === '/' && next === '*') { out += '  '; i++; blockDepth = 1; continue; }
    if (ch === "'") { out += ' '; single = true; continue; }
    if (ch === '$') {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(value.slice(i));
      if (match) { dollarTag = match[0]; out += ' '.repeat(dollarTag.length); i += dollarTag.length - 1; continue; }
    }
    out += ch;
  }
  return out;
}

function addMatches(target, regex, source, transform = value => value) {
  for (const match of source.matchAll(regex)) target.add(transform(match[1]));
}

function analyzeStatement(statement, result) {
  const sql = maskSql(statement).replace(/\s+/g, ' ').trim();
  if (!sql) return;
  if (/^COPY\b[\s\S]*\bFROM\s+stdin\s*;$/i.test(sql)) { result.copyMode = true; return; }

  addMatches(result.objectOwners, /\bOWNER\s+TO\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)/ig, sql,
    value => splitRoleList(value)[0]);
  for (const match of sql.matchAll(/\bALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)/ig)) {
    const role = splitRoleList(match[1])[0];
    result.defaultPrivilegeRoles.add(role);
    result.aclGrantors.add(role);
  }

  const grantSql = /^\s*ALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(sql)
    ? sql.slice(sql.search(/\b(?:GRANT|REVOKE)\b/i))
    : sql;
  const grant = /^\s*(GRANT|REVOKE)\s+([\s\S]*?)\s+(TO|FROM)\s+([\s\S]*?);?\s*$/i.exec(grantSql);
  if (grant) {
    const verb = grant[1].toUpperCase();
    const before = grant[2].trim();
    const recipients = grant[4]
      .replace(/\s+GRANTED\s+BY\s+(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\s*$/i, '')
      .replace(/\s+WITH\s+[\s\S]*$/i, '')
      .replace(/\s+(?:CASCADE|RESTRICT)\s*$/i, '');
    for (const role of splitRoleList(recipients)) result.aclGrantees.add(role);
    const grantor = /\bGRANTED\s+BY\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)/i.exec(grant[4]);
    if (grantor) for (const role of splitRoleList(grantor[1])) result.aclGrantors.add(role);

    const objectAcl = /\bON\b/i.test(before) || /\b(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|EXECUTE|USAGE|CREATE|CONNECT|TEMPORARY|TEMP|MAINTAIN|SET|ALTER SYSTEM)\b/i.test(before);
    if (!objectAcl) for (const role of splitRoleList(before)) result.membershipRoles.add(role);
    else if (!/\bON\b/i.test(before)) fail('RESTORE_ARCHIVE_ROLE_REFERENCE_UNSUPPORTED');
    // `GRANT role TO member` records both role names as required dependencies;
    // for object ACLs, the grantee is recorded above.
    if (verb === 'REVOKE' && !objectAcl) for (const role of splitRoleList(before)) result.membershipRoles.add(role);
  }

  const policy = /^\s*CREATE\s+POLICY\b[\s\S]*?\bTO\s+([\s\S]*?)(?=\s+USING\b|\s+WITH\s+CHECK\b|\s*;?\s*$)/i.exec(sql);
  if (policy) for (const role of splitRoleList(policy[1])) result.aclGrantees.add(role);

  const sessionAuthorization = /^\s*SET\s+SESSION\s+AUTHORIZATION\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)/i.exec(sql);
  if (sessionAuthorization) for (const role of splitRoleList(sessionAuthorization[1])) result.aclGrantors.add(role);
}

function emptyResult() {
  return { objectOwners: new Set(), aclGrantees: new Set(), aclGrantors: new Set(), membershipRoles: new Set(), defaultPrivilegeRoles: new Set(), copyMode: false };
}

function parseSqlRoleDependencies(sql) {
  const scanner = new SqlRoleDependencyScanner();
  scanner.write(Buffer.from(sql, 'utf8'));
  return scanner.end();
}

class SqlRoleDependencyScanner {
  constructor({ maxStatementBytes = 32 * 1024 * 1024 } = {}) {
    this.result = emptyResult();
    this.pending = '';
    this.statement = '';
    this.maxStatementBytes = maxStatementBytes;
    this.single = false; this.double = false; this.lineComment = false; this.blockDepth = 0; this.dollarTag = null;
    this.copyLine = '';
  }

  write(chunk) {
    this.pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    // Keep a small lookahead so token delimiters split across stream chunks
    // are never misread. SQL is scanned in memory but never persisted/logged.
    const safeLength = Math.max(0, this.pending.length - 128);
    this.#consume(safeLength);
  }

  end() {
    this.#consume(this.pending.length);
    if (!this.result.copyMode && this.statement.trim()) analyzeStatement(this.statement, this.result);
    const values = set => [...set].sort();
    return {
      objectOwners: values(this.result.objectOwners),
      aclGrantees: values(this.result.aclGrantees),
      aclGrantors: values(this.result.aclGrantors),
      membershipRoles: values(this.result.membershipRoles),
      defaultPrivilegeRoles: values(this.result.defaultPrivilegeRoles),
    };
  }

  #consume(length) {
    const input = this.pending.slice(0, length);
    this.pending = this.pending.slice(length);
    for (let i = 0; i < input.length; i++) {
      const ch = input[i], next = input[i + 1] ?? this.pending[0];
      if (this.result.copyMode) {
        if (ch === '\n') {
          if (this.copyLine.replace(/\r$/, '').trim() === '\\.') this.result.copyMode = false;
          this.copyLine = '';
        } else if (this.copyLine.length < 4) this.copyLine += ch;
        continue;
      }
      this.statement += ch;
      if (this.statement.length > this.maxStatementBytes) fail('RESTORE_ARCHIVE_ROLE_SCAN_STATEMENT_TOO_LARGE');
      if (this.lineComment) { if (ch === '\n') this.lineComment = false; continue; }
      if (this.blockDepth) {
        if (ch === '/' && next === '*') { this.statement += input[i + 1] ?? ''; if (input[i + 1] !== undefined) i++; this.blockDepth++; }
        else if (ch === '*' && next === '/') { this.statement += input[i + 1] ?? ''; if (input[i + 1] !== undefined) i++; this.blockDepth--; }
        continue;
      }
      if (this.dollarTag) {
        if (input.startsWith(this.dollarTag, i)) {
          this.statement += input.slice(i + 1, i + this.dollarTag.length);
          i += this.dollarTag.length - 1;
          this.dollarTag = null;
        }
        continue;
      }
      if (this.single) {
        if (ch === "'" && next === "'") { this.statement += input[i + 1] ?? ''; if (input[i + 1] !== undefined) i++; }
        else if (ch === "'") this.single = false;
        continue;
      }
      if (this.double) {
        if (ch === '"' && next === '"') { this.statement += input[i + 1] ?? ''; if (input[i + 1] !== undefined) i++; }
        else if (ch === '"') this.double = false;
        continue;
      }
      if (ch === '-' && next === '-') { this.statement += input[i + 1] ?? ''; if (input[i + 1] !== undefined) i++; this.lineComment = true; continue; }
      if (ch === '/' && next === '*') { this.statement += input[i + 1] ?? ''; if (input[i + 1] !== undefined) i++; this.blockDepth = 1; continue; }
      if (ch === "'") { this.single = true; continue; }
      if (ch === '"') { this.double = true; continue; }
      if (ch === '$') {
        const tail = input.slice(i) + this.pending.slice(0, 128);
        const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(tail)?.[0];
        if (tag && i + tag.length <= input.length) { this.statement += tag.slice(1); i += tag.length - 1; this.dollarTag = tag; continue; }
      }
      if (ch === ';') {
        const statement = this.statement;
        this.statement = '';
        analyzeStatement(statement, this.result);
        if (this.result.copyMode) this.copyLine = '';
      }
    }
  }
}

module.exports = { SqlRoleDependencyScanner, parseSqlRoleDependencies };
