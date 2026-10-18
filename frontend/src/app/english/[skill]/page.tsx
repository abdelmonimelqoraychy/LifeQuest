import { notFound } from 'next/navigation';
import SystemShell from '@/components/system/SystemShell';
import { EnglishSkillLesson } from '@/components/english/EnglishAcademy';
import { getEnglishSkill, isEnglishSkillId } from '@/lib/english/english-content';

export default async function EnglishSkillPage({ params }: PageProps<'/english/[skill]'>) {
  const { skill: requestedSkill } = await params;
  if (!isEnglishSkillId(requestedSkill)) notFound();

  const skill = getEnglishSkill(requestedSkill);
  return <SystemShell title={`English · ${skill.name}`} subtitle="PERSONAL LEARNING // B2 → C1"><EnglishSkillLesson key={skill.id} skillId={skill.id} /></SystemShell>;
}
