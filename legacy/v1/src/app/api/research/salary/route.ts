import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lookupSalary } from "@/lib/research/salary-data";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { jobTitle } = body;

  if (!jobTitle) {
    return NextResponse.json({ error: "jobTitle is required" }, { status: 400 });
  }

  const salary = lookupSalary(jobTitle);
  return NextResponse.json(salary);
}
