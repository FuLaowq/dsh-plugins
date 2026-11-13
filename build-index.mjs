import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const registry = "https://registry.npmmirror.com/";
const petIcon = {
  owner: "PC2005-cloud",
  repo: "dsh-pet",
  path: "dsh-pet/assets/logo.png",
  ref: "33938a355f422525886c3facd883d7179c58ebf4",
};
const packages = [
  {
    name: "dsh-pet",
    version: "0.4.8",
    author: "PC2005-cloud",
    icon: "inline-pet",
  },
  {
    name: "dsh-plugin-wallpaper-engine",
    version: "1.4.2",
    author: "chensyovo",
    icon: "https://cdn.jsdelivr.net/npm/dsh-plugin-wallpaper-engine@1.4.2/icon.png",
  },
];

function getPetIconDataUri() {
  const endpoint =
    `repos/${petIcon.owner}/${petIcon.repo}/contents/${petIcon.path}` +
    `?ref=${petIcon.ref}`;
  const base64 = execFileSync("gh", ["api", endpoint, "--jq", ".content"], {
    encoding: "utf8",
  }).trim();
  const image = Buffer.from(base64, "base64");
  if (
    image.length === 0 ||
    image.length > 32 * 1024 ||
    image.toString("hex", 0, 8) !== "89504e470d0a1a0a"
  ) {
    throw new Error("The dsh-pet icon is not a valid PNG within the 32 KiB limit.");
  }
  return `data:image/png;base64,${image.toString("base64")}`;
}

async function getPackageVersion(name, version) {
  const response = await fetch(`${registry}${name}/${version}`);
  if (!response.ok) {
    throw new Error(`Could not read ${name}@${version}: HTTP ${response.status}`);
  }
  const metadata = await response.json();
  if (metadata.name !== name || metadata.version !== version) {
    throw new Error(`Registry returned unexpected metadata for ${name}@${version}.`);
  }
  return metadata;
}

function repositoryUrl(repository) {
  const value = typeof repository === "string" ? repository : repository?.url;
  if (!value) return undefined;
  return value.replace(/^git\+/, "").replace(/\.git$/, "");
}

async function makePlugin(spec) {
  const metadata = await getPackageVersion(spec.name, spec.version);
  const publishedAt =
    metadata._cnpmcore_publish_time ??
    metadata.time?.[spec.version];
  const publishTimestamp = Math.floor(Date.parse(publishedAt) / 1000);
  if (!Number.isFinite(publishTimestamp)) {
    throw new Error(`Missing publish timestamp for ${spec.name}@${spec.version}.`);
  }

  const plugin = {
    name: spec.name,
    author: spec.author,
    description: metadata.description,
    icon: spec.icon === "inline-pet" ? getPetIconDataUri() : spec.icon,
    versions: [
      {
        version: spec.version,
        publishTimestamp,
        source: { type: "npm", registry },
      },
    ],
  };
  const homepage = metadata.homepage;
  const repository = repositoryUrl(metadata.repository);
  if (homepage) plugin.homepage = homepage;
  if (repository) plugin.repository = { url: repository };
  if (Array.isArray(metadata.keywords)) {
    plugin.metadata = { keywords: metadata.keywords };
  }
  if (metadata.engines?.dsh) {
    plugin.versions[0].engines = { dsh: metadata.engines.dsh };
  }
  return plugin;
}

const index = {
  format: 1,
  title: { en: "DSH Community Plugins", zh: "DSH 社区插件" },
  description: {
    en: "Selected DSH plugins installed from the npmmirror registry.",
    zh: "精选 DSH 插件，安装源使用 npmmirror。",
  },
  plugins: await Promise.all(packages.map(makePlugin)),
};

const output = new URL("./dsh-index.json", import.meta.url);
await writeFile(output, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`Wrote ${output.pathname}`);
