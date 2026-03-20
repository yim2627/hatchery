import { Command } from "commander";
import { registerOnboard } from "../src/cli/commands/onboard.js";
import { registerAnalyze } from "../src/cli/commands/analyze.js";
import { registerRender } from "../src/cli/commands/render.js";
import { registerUpgrade } from "../src/cli/commands/upgrade.js";
import { registerAudit } from "../src/cli/commands/audit.js";
import { registerSkill } from "../src/cli/commands/skill.js";
import { registerWorkflow } from "../src/cli/commands/workflow.js";
import { registerJournal } from "../src/cli/commands/journal.js";
import { registerSync } from "../src/cli/commands/sync.js";
import { registerSpec } from "../src/cli/commands/spec.js";

const program = new Command();

program
  .name("hatchery")
  .description("멀티 플랫폼 AI 에이전트 하네스 생성기")
  .version("0.1.6");

registerOnboard(program);
registerAnalyze(program);
registerRender(program);
registerUpgrade(program);
registerAudit(program);
registerSkill(program);
registerWorkflow(program);
registerJournal(program);
registerSync(program);
registerSpec(program);

program.parse();
