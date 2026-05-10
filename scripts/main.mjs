import fs from 'fs-extra';
import path from 'path';
import puppeteer from 'puppeteer';
import { createRequire } from "module";
import prettyBytes from 'pretty-bytes';
import { openSync } from 'fontkit';

import { createPosterImage, removeRootPathSegment, getFontFiles, outputDir, extractVersion, getTTCFontsInfo, copyrightFormat } from './utils.mjs';

const fontDatas = createRequire(import.meta.url)("./data.json");
const BROWSER_RESTART_INTERVAL = 20;

async function createPageContext() {
  const browser = await puppeteer.launch();
  return { browser };
}

async function closePageContext(context) {
  if (!context) return;
  await context.browser.close();
}

;(async () => {
  let argv = process.argv;
  let pageContext = null;
  let shouldWriteDataJson = false;
  /// 获取单个字体信息
  if (argv.includes("-i")) {
    shouldWriteDataJson = true;
    let fontPath = argv[argv.length - 1]
    if (!!fontPath && fontPath !== "-i") {
      const resultData = [...fontDatas];
      const fontName = path.basename(fontPath, path.extname(fontPath)).trim();
      const dataIndex = resultData.findIndex((item) => item.name === fontName)
      const font = openSync(fontPath);
      const ttcFonts = (font.type.toLocaleLowerCase() == "ttc") ? getTTCFontsInfo(fontPath) : [];
      if (dataIndex > -1) {
        if (font.copyright) {
          resultData[dataIndex].copyright = copyrightFormat(font.copyright || ttcFonts[0]?.copyright);
        }
        resultData[dataIndex].numGlyphs = font.numGlyphs;
      }
      fs.writeFileSync("./scripts/data.json", JSON.stringify(resultData, null, 2));
    }
    return process.exit(1);;
  }
  /// 获取所有字体信息
  if (argv.includes("-info")) {
    shouldWriteDataJson = true;
    const resultData = [...fontDatas];
    for (const item in resultData) {
      const fontPath = path.join(outputDir, resultData[item].path);
      const font = openSync(fontPath);
      const ttcFonts = (font.type.toLocaleLowerCase() == "ttc") ? getTTCFontsInfo(fontPath) : [];
      if (font.copyright) {
        resultData[item].copyright = copyrightFormat(font.copyright || ttcFonts[0]?.copyright);
      }
      resultData[item].numGlyphs = font.numGlyphs || ttcFonts[0]?.numGlyphs;
      console.log(`Update font info: \x1b[35;1m ${resultData[item].name} \x1b[0m"`);
    }
    fs.writeFileSync("./scripts/data.json", JSON.stringify(resultData, null, 2));
    return process.exit(1);
  }
  if (argv.includes("-a")) {
    shouldWriteDataJson = true;
    pageContext = await createPageContext();
    let fontPath = argv[argv.length - 1]
    if (!!fontPath && fontPath !== "-a") {
      let fontName = path.basename(fontPath, path.extname(fontPath)).trim();
      if (fontName) {
        const resultData = [...fontDatas];
        const stat = fs.statSync(fontPath);
        let dataIndex = resultData.findIndex((item) => item.name === fontName)
        var font = openSync(fontPath);
        const ttcFonts = (font.type.toLocaleLowerCase() == "ttc") ? getTTCFontsInfo(fontPath) : [];
        if (dataIndex === -1) {
          // console.log("xxx111", fontPath, fontName);
          resultData.unshift({
            name: fontName,
            path: removeRootPathSegment(fontPath, outputDir),
            size: prettyBytes(stat.size),
            byte: stat.size,
            ctime: stat.ctime.getTime(),
            postscriptName: font.postscriptName,
            fullName: font.fullName,
            familyName: font.familyName,
            subfamilyName: font.subfamilyName,
            version: extractVersion(font.version || ttcFonts[0]?.version),
            copyright: copyrightFormat(font.copyright || ttcFonts[0]?.copyright),
            /// 字体中的字形数量
            numGlyphs: font.numGlyphs || ttcFonts[0]?.numGlyphs,
          })
        } else {
          resultData[dataIndex].name = fontName;
          resultData[dataIndex].path = removeRootPathSegment(fontPath, outputDir);
          resultData[dataIndex].size = prettyBytes(stat.size)
          resultData[dataIndex].byte = stat.size
          resultData[dataIndex].ctime = stat.ctime.getTime()
          resultData[dataIndex].postscriptName = font.postscriptName
          resultData[dataIndex].fullName = font.fullName
          resultData[dataIndex].familyName = font.familyName
          resultData[dataIndex].subfamilyName = font.subfamilyName
          resultData[dataIndex].version = extractVersion(font.version || ttcFonts[0]?.version)
          resultData[dataIndex].copyright = copyrightFormat(font.copyright || ttcFonts[0]?.copyright)
          resultData[dataIndex].numGlyphs = font.numGlyphs || ttcFonts[0]?.numGlyphs
        }
        await createPosterImage(pageContext.browser, fontPath, fontName);
        fs.writeFileSync("./scripts/data.json", JSON.stringify(resultData, null, 2));
      }
    } else {
      console.log("Please enter a font file path");
    }
  } else {
    pageContext = await createPageContext();
    // create all images
    await fs.emptyDir('docs/images');
    const files = await getFontFiles("./docs/fonts");
    const resultData = []
    for (const [index, filename] of files.entries()) {
      let fontName = path.basename(filename, path.extname(filename)).trim();
      if (!fontName.startsWith("__")) {
        const stat = fs.statSync(filename);
        let data = fontDatas.find((item) => item.name === fontName) || {};
        data.name = fontName;
        data.path = removeRootPathSegment(filename);
        data.size = prettyBytes(stat.size)
        data.byte = stat.size
        data.ctime = stat.ctime.getTime();
        const font = openSync(filename);
        const ttcFonts = (font.type.toLocaleLowerCase() == "ttc") ? getTTCFontsInfo(filename) : [];
        data.postscriptName = font.postscriptName
        data.fullName = font.fullName
        data.familyName = font.familyName
        data.subfamilyName = font.subfamilyName
        data.version = extractVersion(font.version || ttcFonts[0]?.version)
        data.copyright = copyrightFormat(font.copyright || ttcFonts[0]?.copyright)
        data.numGlyphs = font.numGlyphs || ttcFonts[0]?.numGlyphs
        resultData.push(data);
        await createPosterImage(pageContext.browser, filename, fontName);

        if ((index + 1) % BROWSER_RESTART_INTERVAL === 0) {
          await closePageContext(pageContext);
          pageContext = await createPageContext();
        }
        if (global.gc && (index + 1) % BROWSER_RESTART_INTERVAL === 0) {
          global.gc();
        }
      } else {
        console.log(`Skip 2 font file: \x1b[35;1m ${filename} \x1b[0m"`);
      }
    }
    if (shouldWriteDataJson) {
      fs.writeFileSync("./scripts/data.json", JSON.stringify(resultData, null, 2));
    }
  }
  await closePageContext(pageContext);
})();
