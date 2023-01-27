const sharp = require("sharp");
const fs = require("node:fs");
const { async } = require("regenerator-runtime");
const path = require("node:path");

const fsReadPromise = (file) =>
  new Promise((res, rej) => {
    fs.readFile(file, (err, data) => {
      if (err) return rej(err);
      return res(data);
    });
  });

// fs.readdir("./dev-data/img/", (err, files) => {
//   if (err) return console.log(err);
//   console.log(files);
// });

const readDirPromise = (folder) =>
  new Promise((res, rej) => {
    fs.readdir(folder, (err, files) => {
      if (err) return rej(err);
      return res(files);
    });
  });

const changeImgFormat = async () => {
  // console.log(path.resolve("./dev-data/img/aarav.jpg"));

  const folder = await readDirPromise("./public/img/tours");
  console.log(folder);
  const filePromises = folder.map((file) =>
    fsReadPromise(`./public/img/tours/${file}`)
  );
  const files = await Promise.all(filePromises);
  const newFiles = files.map((file, i) => {
    const fileName = folder[i].split(".")[0];
    console.log("fileName", fileName);
    return sharp(file)
      .toFormat("webp")
      .webp({ quality: 75 })
      .toFile(`./public/img/tours/${fileName}.webp`);
  });
  await Promise.all(newFiles);
  console.log("11");
};

changeImgFormat();
