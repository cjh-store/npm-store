#!/usr/bin/env node
import { program } from "commander";
import { commitCommand } from "./commands/commit";
import { tagCommand } from "./commands/tag";

program
  .name("git-pro")
  .description("Git workflow enhancement tool")
  .version("1.0.0");

program
  .command("commit")
  .description("使用 commitizen 规范化提交代码")
  .action(commitCommand);

program.command("tag").description("创建新的版本标签").action(tagCommand);

program.parse();
