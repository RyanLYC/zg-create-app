import fs from "node:fs";
import path from "node:path";
import { Framework } from "./type";
import { fileURLToPath } from "node:url";
import * as colorList from "kolorist";

const { blue, cyan, green, lightGreen, lightRed, magenta, red, reset, yellow } =
  colorList;
const colorArr = [
  blue,
  cyan,
  green,
  lightGreen,
  lightRed,
  magenta,
  red,
  reset,
  yellow,
];
const shortLangDic = {
  ts: "TypeScript",
  js: "JavaScript",
};

/**去除空格及末尾的斜杠 */
export const formatTargetDir = (dir: string) => {
  return dir?.trim().replace(/\/+$/g, "");
};

export const isEmpty = (dir: string) => {
  const files = fs.readdirSync(dir);
  return files.length === 0 || (files.length === 1 && files[0] === ".git");
};

export function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName
  );
}

export function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z\d\-~]+/g, "-");
}

export function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (let file of fs.readdirSync(dir)) {
    fs.rmSync(path.resolve(dir, file), {
      recursive: true,
      force: true,
    });
  }
}

export function pkgFromUserAgent(userAgent: string | undefined) {
  // console.log(process.env.npm_config_user_agent); //npm/8.16.0 node/v16.15.0 win32 x64 workspaces/false
  const pkgSpecArr = userAgent?.split(" ")[0].split("/");

  return {
    name: pkgSpecArr?.[0] || "npm",
    version: pkgSpecArr?.[1] || "latest",
  };
}

export function copy(file, target) {
  const stat = fs.statSync(file);
  if (stat.isFile()) {
    fs.copyFileSync(file, target);
  } else {
    copyDir(file, target);
  }
}

export function copyDir(dir, target) {
  // 如果是文件夹，先创建文件夹

  fs.mkdirSync(target, { recursive: true });
  const files = fs.readdirSync(dir);
  for (let file of files) {
    const filePath = path.resolve(dir, file);
    const targetPath = path.resolve(target, file);
    // 递归创建
    copy(filePath, targetPath);
  }
}

/**首字母大写 */
export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const getAllFrameworks = () => {
  const DIRFRAMEWORKS: {
    [key: string]: Framework[];
  } = {};
  const dirs = fs.readdirSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../template")
  );
  dirs.forEach((dir) => {
    DIRFRAMEWORKS[dir] = getFrameworksFromDir(dir);
  });
  return DIRFRAMEWORKS;
};

/**例如：template-react-ts切割字符串返回[react, ts] */
const parseTemp = (template: string) => {
  const tempArr = template.split("-").slice(1);
  return tempArr;
};

export const getFrameworksFromDir = (dir: string) => {
  const FRAMEWORKS: Framework[] = [];
  //获取模板所在路径
  const templateDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../template/${dir}`
  );
  const templates = fs.readdirSync(templateDir);

  templates.forEach((template, i) => {
    const stat = fs.statSync(path.resolve(templateDir, template));
    if (stat.isDirectory()) {
      const [fram, vari] = parseTemp(template);
      if (!FRAMEWORKS.some((framework) => framework.name === fram)) {
        FRAMEWORKS.push({
          name: fram,
          display: capitalize(fram),
          color: colorArr[i % colorArr.length],
          variants: [],
        });
      }
      const framework = FRAMEWORKS.find((f) => f.name === fram);
      if (framework) {
        framework.variants.push({
          name: fram + (vari ? "-" + vari : ""),
          display: vari ? shortLangDic[vari] || capitalize(vari) : "JavaScript",
          color: colorArr[i % colorArr.length],
        });
      }
    }
  });
  return FRAMEWORKS;
};
