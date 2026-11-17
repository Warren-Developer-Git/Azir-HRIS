import { redirect } from 'next/navigation';

export default async function MyPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  query.set('tab', 'my-payslips');

  for (const [key, value] of Object.entries(params)) {
    if (key !== 'tab' && typeof value === 'string') {
      query.set(key, value);
    }
  }

  redirect(`/payroll?${query.toString()}`);
}
