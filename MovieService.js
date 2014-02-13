"use strict";
var mongo = require("droopy-mongo"),
	config = require('./config'),
	models = require("../models"),
	q = require("q"),
	dao;

var MovieService = function(url) {
	url = url || config.mongo.url;
	dao = new mongo.MongoDao(url);
	this.dao = dao;
};

var transaction = function(func) {
	var deferred = q.defer();
	dao.getCollection("movies").then(function(movies) {
		func(movies, deferred);
	}, function() {
		console.log("Error retrieving movies collection.");
	});
	return deferred.promise;
};

var sortBy = function(page, size, sortObject) {
	page = page || 1;
	size = size || 20;
	var skip = (page - 1) * size;
	var options = {
		sort: sortObject,
		skip: skip,
		limit: size
	};
	var query = new mongo.MongoQuery(null, models.ThinMovie.fields, options);
	return _find(query, models.ThinMovie);
};

var query = function(queryObject, sort, displayed, size) {
	var options = {
		sort: sort || {
			addedToDb: -1
		},
		skip: displayed || 0,
		limit: size || 20
	};
	var query = new mongo.MongoQuery(queryObject, models.ThinMovie.fields, options);
	return _find(query, models.ThinMovie);
};

var _find = function(mongoQuery, Model) {
	return transaction(function(movies, deferred) {
		movies.find(mongoQuery).then(function(results) {
			if (Model) {
				deferred.resolve(results.map(function(result) {
					return new Model(result);
				}));
			} else {
				deferred.resolve(results);
			}
		});
	});
};



MovieService.prototype.findOne = function(query) {
	return transaction(function(movies, deferred) {
		movies.findOne(query).then(function(result) {
			deferred.resolve(models.FullMovie.create(result));
		});
	});
};

MovieService.prototype.getById = function(id) {
	return this.findOne({
		id: id
	});
};

MovieService.prototype.checkIfExists = function(query) {
	return transaction(function(movies, deferred) {
		movies.checkIfExists(query).then(deferred.resolve);
	});
};

MovieService.prototype.insert = function(movie) {
	movie.addedToDb = new Date();
	return transaction(function(movies, deferred) {
		movies.insert(movie).then(deferred.resolve);
	});
};

MovieService.prototype.toggleWatched = function(movieId, watched) {
	return transaction(function(movies, deferred) {
		movies._collection.update({
			id: movieId
		}, {
			$set: {
				watched: watched
			}
		}, function() {});
	});
};

MovieService.prototype.query = function(queryObject, sort, displayed, size) {
	return query(queryObject, sort, displayed, size);
};

MovieService.prototype.search = function(search) {
	var regex = "^" + search + "|\\s" + search;
	var queryObject = {
		title: {
			"$regex": regex,
			"$options": "i"
		}
	};
	return query(queryObject, null, null, 5);
};

MovieService.prototype.filmography = function(actorId) {
	var queryObj = {
		"casts.cast.id": actorId
	};
	var sort = {
		"release_date": -1
	};
	return query(queryObj, sort, 0, 2000);
};

MovieService.prototype.genres = function() {
	return transaction(function(movies, deferred) {
		movies._collection.aggregate([{
			$project: {
				genres: 1,
				title: 1
			}
		}, {
			$unwind: "$genres"
		}, {
			$group: {
				_id: "$genres.name",
				count: {
					$sum: 1
				}
			}
		}, {
			$sort: {
				count: -1
			}
		}], function(error, genres) {
			if (error) {
				console.log(error);
				throw error;
			}
			deferred.resolve(genres);
		});
	});
};

MovieService.prototype.favorites = function() {
	var query = {
		'tags.favorited': {
			$ne: null
		}
	};
	var options = {
		sort: {
			'tags.favorited': -1
		}
	};
	var fields = models.ThinMovie.fields;
	return _find(new mongo.MongoQuery(query, fields, options), models.ThinMovie);
};

MovieService.prototype.queue = function() {
	var query = {
		'tags.queued': {
			$ne: null
		}
	};
	var options = {
		sort: {
			'tags.queued': -1
		}
	};
	var fields = models.ThinMovie.fields;
	return _find(new mongo.MongoQuery(query, fields, options), models.ThinMovie);
};

MovieService.prototype.update = function(movieId, updateObj) {
	return transaction(function(movies, deferred) {
		var update = {
			$set: updateObj
		};
		movies._collection.update({
			id: movieId
		}, updateObj, function(err) {
			if (err) {
				deferred.reject(err);
			} else {
				deferred.resolve();
			}
		});
	});
};

MovieService.prototype.setTag = function(movieId, tag, value) {
	return transaction(function(movies, deferred) {
		var key = 'tags.' + tag;
		var updateObj = {
			$set: {}
		};
		updateObj.$set[key] = value;
		movies._collection.update({
			id: movieId
		}, updateObj, function() {});
	});
};


module.exports = MovieService;