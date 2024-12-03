import { tagService } from "../services/tag";
import { Logger } from "../utils/logger";

export async function tagCommand(): Promise<void> {
  try {
    await tagService.createTag();
  } catch (error) {
    Logger.error("标签创建失败：" + error);
    process.exit(1);
  }
}
