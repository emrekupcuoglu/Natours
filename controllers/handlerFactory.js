const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const APIFeatures = require("../utils/APIFeatures");

exports.createOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const newDoc = await Model.create(req.body);

    res.status(201).json({
      status: "success",
      data: {
        newDoc,
      },
    });
  });

exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (doc === null) {
      return next(new AppError("There is no document with that ID", 404));
    }

    res.status(204).json({
      status: "Success",
      data: {
        tour: null,
      },
    });
  });

exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      context: "query",
    });

    if (doc === null) {
      return next(new AppError("There is no document with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  });

exports.getOne = (Model, popOptions = null) =>
  catchAsync(async (req, res, next) => {
    const query = Model.findById(req.params.id);
    if (popOptions) {
      query.populate(popOptions);
    }
    const doc = await query;

    if (doc === null) {
      return next(new AppError("There is no document with that ID", 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  });

exports.getAll = (Model) =>
  catchAsync(async (req, res, next) => {
    const filter = {};
    if (req.params.tourId) {
      filter.tour = req.params.tourId;
    }

    const features = await new APIFeatures(Model, Model.find(filter), req.query)
      .filter()
      .sortQuery()
      .limitFields()
      .paginate();

    const docs = await features.query;

    res.status(200).json({
      status: "success",
      results: docs.length,
      data: {
        docs: docs,
      },
    });
  });
