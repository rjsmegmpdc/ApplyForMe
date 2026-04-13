import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseFile } from "@/lib/parsers";
import { hasPermission, type Role } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role as Role;
  if (!hasPermission(role, "import:file")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedExtensions = ["json", "docx", "xlsx", "xls", "md", "txt"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${allowedExtensions.join(", ")}` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const profile = await parseFile(buffer, file.name);

    return NextResponse.json({
      parsed: true,
      filename: file.name,
      profile,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
