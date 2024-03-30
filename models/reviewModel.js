const mongoose = require("mongoose");
const Tour = require("./tourModel");
const AppError = require("../utils/appError");

const reviewSchema = new mongoose.Schema(
  {
    review: {
      type: String,
      required: [true, "Enter a review"],
      minlength: [50, "A review must be at least 50 characters long"],
    },

    rating: {
      type: Number,
      required: [true, "A review must have a rating"],
      min: 1,
      max: 5,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: [true, "A review must belong to a tour"],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A review must belong to a user"],
    },
  },
  {
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

reviewSchema.pre(/^find/, function (next) {
  this.populate({
    path: "user",
    select: "name photo",
  });
  next();
});

reviewSchema.statics.calcAverageRating = async function (tourID) {
  try {
    const stats = await this.aggregate([
      {
        $match: { tour: tourID },
      },
      {
        $group: {
          _id: "$tour",
          nRatings: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
    ]);
    if (stats.length > 0) {
      await Tour.findByIdAndUpdate(tourID, {
        ratingsQuantity: stats[0].nRatings,
        ratingsAverage: stats[0].avgRating,
      });
    } else {
      await Tour.findByIdAndUpdate(tourID, {
        ratingsQuantity: 0,
        ratingsAverage: 4.5,
      });
    }
  } catch (err) {
    throw new Error(err);
  }
};

reviewSchema.post("save", async function (doc, next) {
  try {
    await this.constructor.calcAverageRating(this.tour);
    next();
  } catch (err) {
    next(new AppError("Something Went Wrong!", 500));
  }
});

reviewSchema.post(/^findOneAnd/, async (doc, next) => {
  await doc.constructor.calcAverageRating(doc.tour);
});

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;
