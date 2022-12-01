// 引入node内置模块
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// node的跨平台创建子进程方案
import spawn from "cross-spawn";
// 解析命令行参数
import minimist from "minimist";
// 命令行交互式提示
import prompts, { override } from "prompts";
// 多彩命令行输出库
import {
  blue,
  cyan,
  green,
  lightGreen,
  lightRed,
  magenta,
  red,
  reset,
  yellow,
} from "kolorist";

import { Framework } from "./type";
import {
  copy,
  emptyDir,
  formatTargetDir,
  isEmpty,
  isValidPackageName,
  pkgFromUserAgent,
  toValidPackageName,
  getAllFrameworks,
} from "./utils";

// 获取用户初始输入 npx zg-create-app xxx -t xxx创建项目
const argv = minimist<{
  d?: string;
  dir?: string;
  // t?: string;
  // template?: string;
}>(process.argv.slice(2), { string: ["_"] });

const cwd = process.cwd(); // 获取当前工作目录

const renameFiles: Record<string, string | undefined> = {
  _gitignore: ".gitignore",
};

// 默认文件夹
const defaultTargetDir = "zg-project";
// 目录中所有模版对象；目录名为key
const DIRFRAMEWORKS = getAllFrameworks();

async function init() {
  const argTargetDir = formatTargetDir(argv._[0]);
  // let argTemplate = argv.template || argv.t;
  let dirName = argv.d || argv.dir;

  let targetDir = argTargetDir || defaultTargetDir;
  const getProjectName = () =>
    targetDir === "." ? path.basename(path.resolve()) : targetDir;

  let FRAMEWORKS = DIRFRAMEWORKS[dirName] || [];

  let result: prompts.Answers<
    "projectName" | "overwrite" | "packageName" | "framework" | "variant"
  >;

  try {
    result = await prompts(
      [
        {
          type: argTargetDir ? null : "text",
          name: "projectName",
          message: reset("Project name:"),
          initial: defaultTargetDir,
          onState: (state) => {
            targetDir = formatTargetDir(state.value) || defaultTargetDir;
          },
        },
        {
          // 若文件夹已存在或不为空
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : "confirm",
          name: "overwrite",
          message: () =>
            (targetDir === "."
              ? "Current directory"
              : `Target directory "${targetDir}"`) +
            ` is not empty. Remove existing files and continue?`,
        },
        {
          type: (_, { overwrite }: { overwrite?: boolean }) => {
            if (overwrite === false) {
              throw new Error(red("✖") + " Operation cancelled");
            }
            return null;
          },
          name: "overwriteChecker",
        },
        {
          // 需要对于不符合条件的projectName，我们需要提示用户重新输入一个项目名称
          type: () => (isValidPackageName(getProjectName()) ? null : "text"),
          name: "packageName",
          message: reset("Package name:"),
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir) =>
            isValidPackageName(dir) || "Invalid package.json name",
        },
        {
          type: () => (dirName && dirName in DIRFRAMEWORKS ? null : "select"),
          name: "framework",
          message: () => {
            return typeof dirName === "string" && !(dirName in DIRFRAMEWORKS)
              ? reset(
                  `"${dirName}" isn't a valid template. Please choose from below: `
                )
              : reset("Select a dir name:");
          },
          choices: Object.keys(DIRFRAMEWORKS).map((name) => ({
            title: name,
            value: name,
          })),
          initial: 0,
          onState(state) {
            dirName = state.value;
            FRAMEWORKS = DIRFRAMEWORKS[state.value] || [];
          },
        },
        {
          type: () =>
            dirName &&
            DIRFRAMEWORKS[dirName].find((fram) => fram.name === dirName)
              .variants?.length
              ? "select"
              : null,
          name: "variant",
          message: reset("Select a variant:"),
          initial: 0,
          choices: () =>
            DIRFRAMEWORKS[dirName]
              .find((fram) => fram.name === dirName)
              .variants.map((vari) => ({
                title: vari.color(vari.display || vari.name),
                value: vari.name,
              })),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red("✖") + " Operation cancelled");
        },
      }
    );
  } catch (cancelled: any) {
    console.log(cancelled.message);
    return;
  }

  const { framework, overwrite, packageName, variant } = result;

  const root = path.join(cwd, targetDir);

  // 清空文件夹 | 新建文件夹
  if (overwrite) {
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  const template: string = variant || framework?.name; // || argTemplate;

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : "npm";
  const isYarn1 = pkgManager === "yarn" && pkgInfo.version.startsWith("1.");

  const { customCommand } =
    FRAMEWORKS.flatMap((f) => f.variants).find((v) => v.name === template) ??
    {};

  if (customCommand) {
    const fullCustomCommand = customCommand
      .replace("TARGET_DIR", targetDir)
      .replace(/^npm create/, `${pkgManager} create`)
      // Only Yarn 1.x doesn't support `@version` in the `create` command
      .replace("@latest", () => (isYarn1 ? "" : "@latest"))
      .replace(/^npm exec/, () => {
        // Prefer `pnpm dlx` or `yarn dlx`
        if (pkgManager === "pnpm") {
          return "pnpm dlx";
        }
        if (pkgManager === "yarn" && !isYarn1) {
          return "yarn dlx";
        }
        // Use `npm exec` in all other cases,
        // including Yarn 1.x and other custom npm clients.
        return "npm exec";
      });

    const [command, ...args] = fullCustomCommand.split(" ");
    const { status } = spawn.sync(command, args, {
      stdio: "inherit",
    });
    process.exit(status ?? 0);
  }

  //获取模板所在路径
  const templateDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../template/${dirName}/template-${template}`
  );

  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file);
    if (content) {
      fs.writeFileSync(targetPath, content);
    } else {
      copy(path.join(templateDir, file), targetPath);
    }
  };

  const files = fs.readdirSync(templateDir);
  for (const file of files.filter((f) => f !== "package.json")) {
    write(file);
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), "utf-8")
  );

  pkg.name = packageName || getProjectName();

  write("package.json", JSON.stringify(pkg, null, 2));

  console.log(`\nDone. Now run:\n`);
  // 如果当前目录不是项目目录，引导用户引入
  if (root !== cwd) {
    console.log(`  cd ${path.relative(cwd, root)}`);
  }

  switch (pkgManager) {
    case "yarn":
      console.log("  yarn");
      console.log("  yarn dev");
      break;
    default:
      console.log(`  ${pkgManager} install`);
      console.log(`  ${pkgManager} run dev`);
      break;
  }
  console.log();
}

init().catch((e) => {
  console.error(e);
});
