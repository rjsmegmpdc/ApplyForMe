/** Placeholder — replaced by the pipeline task. */
export async function handleInboundEmail(
  _message: ForwardableEmailMessage,
  _env: CloudflareEnv,
  _ctx: ExecutionContext
): Promise<void> {
  console.log('inbound email received; pipeline not wired yet');
}
