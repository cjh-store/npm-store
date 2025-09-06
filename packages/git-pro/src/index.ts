#!/usr/bin/env node
import { program } from "commander";
import { commitCommand } from "./commands/commit";
import { tagCommand } from "./commands/tag";
import { mergeTestCommand } from "./commands/merge-test";
import { aiCommitCommand } from "./commands/ai-commit";

program
  .name("git-pro")
  .description("Git workflow enhancement tool")
  .version("1.0.0");

program
  .command("commit")
  .description("提交代码，默认使用AI辅助提交")
  .action(aiCommitCommand);

program
  .command("conventional-commit")
  .alias("cc")
  .description("使用 commitizen 规范化提交代码")
  .action(commitCommand);

program
  .command("ai-commit")
  .alias("aic")
  .description("使用 DeepSeek AI 辅助生成提交信息")
  .action(aiCommitCommand);

program.command("tag").description("创建新的版本标签").action(tagCommand);

program
  .command("merge-test")
  .description("将当前分支合并到test分支并推送")
  .action(mergeTestCommand);

program.parse();
