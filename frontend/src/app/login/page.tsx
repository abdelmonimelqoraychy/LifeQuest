import AuthForm from '@/components/auth/AuthForm';
export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) { const { notice } = await searchParams; return <AuthForm mode="login" notice={notice} />; }
