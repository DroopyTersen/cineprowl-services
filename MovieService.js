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

var _query = function(queryObject, sort, displayed, size) {
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
	if (typeof id === "string") {
		id = parseInt(id, 10);		
	}
	console.log(this);
	return this.findOne({
		id: id
	});
};

MovieService.prototype.checkIfExists = function(query) {
	return transaction(function(movies, deferred) {
		movies.checkIfExists(query).then(deferred.resolve);
	});
};

MovieService.prototype.query = function(queryObject, sort, displayed, size) {
	return _query(queryObject, sort, displayed, size);
};

MovieService.prototype.search = function(search, limit) {
	var regex = "^" + search + "|\\s" + search;
	var queryObject = {
		title: {
			"$regex": regex,
			"$options": "i"
		}
	};
	var size = limit || 5
	return _query(queryObject, null, null, size);
};



//WRITE ACTIONS
MovieService.prototype.insert = function(movie) {
	movie.addedToDb = new Date();
	return transaction(function(movies, deferred) {
		movies.insert(movie).then(deferred.resolve);
	});
};

MovieService.prototype.update = function(movieId, update) {
	return transaction(function(movies, deferred) {
		movies.updateOne( {id: movieId}, update)
			.then(deferred.resolve, deferred.reject);
	});
};

MovieService.prototype.remove = function(movieId) {
	if (typeof movieId === "string") {
		movieId = parseInt(movieId, 10);
	}
	return transaction(function(movies, deferred) {
		movies.remove({id: movieId}).then(deferred.resolve);
	});
}
MovieService.prototype.setTag = function(movieId, tag, value) {
	var updateObj = {};
	updateObj['tags.' + tag] = value;
	return this.update(movieId, updateObj);
};

MovieService.prototype.toggleWatched = function(movieId, watched) {
	return this.update(movieId, { watched: watched });
};

//HELPERS
MovieService.prototype.filmography = function(actorId) {
	var queryObj = {
		"casts.cast.id": actorId
	};
	var sort = {
		"release_date": -1
	};
	return _query(queryObj, sort, 0, 2000);
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

MovieService.prototype.actors = function(count) {
	return transaction(function(movies, deferred) {
		movies._collection.aggregate([{
			$project: {
				'casts.cast.name': 1,
				'casts.cast.id': 1,
				'casts.cast.profile_path': 1,
				title: 1
			}
		}, {
			$unwind: "$casts.cast"
		}, {
			$group: {
				_id: {
					id: "$casts.cast.id",
					name: "$casts.cast.name",
					profile_path: "$casts.cast.profile_path"
				},
				count: {
					$sum: 1
				},
			}
		}, {
			$sort: {
				count: -1
			}
		}, {
			$limit: count || 200
		}], function(error, actors) {
			if (error) {
				console.log(error);
				throw error;
			}
			deferred.resolve(actors);
		});
	});
};
var _tagsQuery = function(tag) {
	var query = {};
	query[tag] = { $ne: null };

	var options = { sort: {} };
	options.sort[tag] = -1
	
	var fields = models.ThinMovie.fields;
	return _find(new mongo.MongoQuery(query, fields, options), models.ThinMovie);
};

MovieService.prototype.favorites = function() {
	return _tagsQuery("tags.favorited");
};

MovieService.prototype.queue = function() {
	return _tagsQuery("tags.queued");
};

module.exports = MovieService;