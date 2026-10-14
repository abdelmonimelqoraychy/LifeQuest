# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferred from the existing application: people using personal goals and routines to build progress over time.

## Product Purpose

Inferred from the existing application: LifeQuest turns personal development activities into quests, records confirmed progress as experience, and presents a Hunter-style progression system.

## Capabilities and Constraints

- Existing capabilities include quests, attributes, Hunter progression, Boss missions, Focus sessions, and creative tools.
- Authenticated cloud screens use server snapshots and RPC-backed commands. Do not introduce browser-local mutation paths for connected accounts.
- XP, rank, and reward rules are server-authoritative for the cloud experience.
- The current visual direction request is scoped to the Dashboard and is not a product-wide design commitment.

## Evidence on Hand

- Existing implementation: `frontend/src/components/hunter/HunterWorkspace.tsx` and `frontend/src/lib/hunter/`.
- User-requested Dashboard content: Hunter profile, rank, level, XP, attributes, daily quests, active Boss, Focus, and recent activity.

## Product Principles

- Show progress grounded in confirmed activity.
- Keep cloud state server-authoritative.
- Make daily actions and longer-term progression easy to understand.
