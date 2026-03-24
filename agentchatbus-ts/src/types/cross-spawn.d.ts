declare module "cross-spawn" {
  import type { SpawnOptions, ChildProcessWithoutNullStreams } from "node:child_process";

  export default function spawn(
    command: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ): ChildProcessWithoutNullStreams;
}
