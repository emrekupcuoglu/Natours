const fs = require("fs");

const toursData = JSON.parse(
  fs.readFileSync(`${__dirname}/../dev-data/data/tours-simple.json`)
);

exports.checkID = (req, res, next, val) => {
  if (Number(req.params.id) > toursData.length) {
    return res.status(404).json({
      status: "fail",
      message: "Invalid ID",
    });
  }
  next();
};

exports.checkBody = (req, res, next) => {
  if (!(req.body.name && req.body.price)) {
    return res.status(400).json({
      status: "fail",
      message: "missing name or price",
    });
  }
  next();
};

exports.getAllTours = (req, res) => {
  res.status(200).json({
    status: "success",
    requestedAt: req.requestTime,
    results: toursData.length,
    data: {
      tours: toursData,
    },
  });
};

exports.getTour = (req, res) => {
  const id = Number(req.params.id);
  const tour = toursData.find((el) => el.id === id);

  res.status(200).json({
    status: "Success",
    data: {
      tour,
    },
  });
};

exports.createTour = (req, res) => {
  const newID = toursData[toursData.length - 1] + 1;
  const newTour = Object.assign({ id: newID }, req.body);
  toursData.push(newTour);

  fs.writeFile(
    `${__dirname}/dev-data/data/tours-simple.json`,
    JSON.stringify(toursData),
    (err) => {
      res.status(201).json({
        status: "success",
        data: {
          tour: newTour,
        },
      });
    }
  );
};

exports.updateTour = (req, res) => {
  res.status(200).json({
    status: "Success",
    data: {
      tour: "<Updated Tour>",
    },
  });
};

exports.deleteTour = (req, res) => {
  res.status(204).json({
    status: "Success",
    data: {
      tour: null,
    },
  });
};
