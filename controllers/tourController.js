const { async } = require("regenerator-runtime");
const multer = require("multer");
const sharp = require("sharp");
const Tour = require("../models/tourModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const handlerFactory = require("./handlerFactory");

const multerStorage = multer.memoryStorage();
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload only images.", 400), false);
  }
};
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

exports.uploadTourImages = upload.fields([
  { name: "imageCover", maxCount: 1 },
  { name: "images", maxCount: 3 },
]);

exports.resizeTourImages = catchAsync(async (req, res, next) => {
  if (!req.files.imageCover || !req.files.images) return next();

  const imageCover = req.files.imageCover[0];
  req.body.imageCover = `tour-${req.params.id}-${Date.now()}-cover`;
  await sharp(imageCover.buffer)
    .resize(2000, 1333)
    .toFormat("jpg")
    .jpeg({ quality: 90 })
    .toFile(`public/img/tours/${req.body.imageCover}`);

  req.body.images = [];
  const imagePromises = req.files.images.map((file, i) => {
    const filename = `tour-${req.params.id}-${Date.now()}-${i + 1}.jpg`;
    req.body.images.push(filename);
    return sharp(file.buffer)
      .resize(2000, 1333)
      .toFormat("jpg")
      .jpeg({ quality: 90 })
      .toFile(`public/img/tours/${filename}`);
  });
  await Promise.all(imagePromises);

  next();
});

exports.aliasTopTours = (req, res, next) => {
  req.query.limit = "5";
  req.query.sort = "-ratingsAverage price";
  req.query.fields = "name,price,ratingsAverage,summary,difficulty";
  next();
};

exports.getAllTours = handlerFactory.getAll(Tour);

exports.getTour = handlerFactory.getOne(Tour, {
  path: "reviews",
  select: "-__v",
});

exports.createTour = handlerFactory.createOne(Tour);

exports.updateTour = handlerFactory.updateOne(Tour);

exports.deleteTour = handlerFactory.deleteOne(Tour);

exports.getTourStats = catchAsync(async (req, res, next) => {
  const stats = await Tour.aggregate([
    {
      $match: { ratingsAverage: { $gte: 4.5 } },
    },
    {
      $group: {
        _id: { $toUpper: "$difficulty" },
        numTours: { $sum: 1 },
        numRatings: { $sum: "$ratingsQuantity" },
        averageRating: { $avg: "$ratingsAverage" },
        avrPrice: { $avg: "$price" },
        minPrice: { $min: "$price" },
        maxPrice: { $max: "$price" },
      },
    },
    {
      $sort: { avrPrice: 1 },
    },
  ]);
  res.status(200).json({
    status: "Success",
    data: {
      stats,
    },
  });
});

exports.getMonthlyPlan = catchAsync(async (req, res, next) => {
  const year = Number(req.params.year);
  const plan = await Tour.aggregate([
    {
      $unwind: "$startDates",
    },
    {
      $match: {
        startDates: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        },
      },
    },
    {
      $group: {
        _id: { $month: "$startDates" },
        numTourStarts: { $sum: 1 },
        tours: { $push: "$name" },
        durations: { $push: "$duration" },
      },
    },
    {
      $addFields: {
        month: "$_id",
        weeks: {
          $map: {
            input: "$durations",
            as: "el",
            in: { $divide: ["$$el", 7] },
          },
        },
      },
    },
    {
      $project: { _id: 0 },
    },
    {
      $sort: {
        numTourStarts: -1,
      },
    },
    {
      $limit: 12,
    },
  ]);
  res.status(200).json({
    status: "Success",
    data: {
      plan,
    },
  });
});

exports.getToursWithin = catchAsync(async (req, res, next) => {
  const { distance, latlng, unit } = req.params;
  const [lat, lng] = latlng.split(",");

  const radius = unit === "mi" ? distance / 3963.2 : distance / 6378.1;

  if ((!lat, !lng)) {
    next(
      new AppError(
        "Please provide latitude and longitude in the format lat,lng.",
        400
      )
    );
  }

  const tours = await Tour.find({
    startLocation: { $geoWithin: { $centerSphere: [[lng, lat], radius] } },
  });

  res.status(200).json({
    status: "success",
    results: tours.length,
    data: {
      data: tours,
    },
  });
});

exports.getDistances = catchAsync(async (req, res, next) => {
  const { latlng, unit } = req.params;
  const [lat, lng] = latlng.split(",");
  if ((!lat, !lng)) {
    next(
      new AppError(
        "Please provide latitude and longitude in the format lat,lng.",
        400
      )
    );
  }

  const multiplier = unit === "mi" ? 0.000621371 : 0.001;
  const distances = await Tour.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        },
        distanceField: "distance",
        distanceMultiplier: multiplier,
      },
    },
    {
      $project: {
        distance: 1,
        name: 1,
      },
    },
  ]);
  res.status(200).json({
    status: "success",
    results: distances.length,
    data: {
      data: distances,
    },
  });
});
