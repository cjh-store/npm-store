import { gitService } from "../services/git";
import { configService } from "../services/config";
import { Logger } from "../utils/logger";

export async function commitCommand(): Promise<void> {
  try {
    // 检查配置文件
    if (!configService.checkConfig()) {
      return;
    }

    // 提交前确认
    const confirmed = await gitService.confirmCommit();
    if (!confirmed) {
      Logger.info("已取消提交");
      return;
    }

    // 使用 commitizen 进行提交
    await gitService.commitWithCz();
  } catch (error) {
    Logger.error("提交失败：" + error);
    process.exit(1);
  }
}
