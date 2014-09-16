"use strict";
var mongo = require("droopy-mongo"),
	config = require('./config'),
	models = require("cineprowl-models"),
	q = require("q"),
	dao;


var MovieService = function(url) {
	url = url || config.mongo.url;
	dao = new mongo.MongoDao(url);
	this.movies = dao.collection("movies");
	this.dao = dao;
};

MovieService.prototype._query = function(queryObject, sort, displayed, size) {
	var options = {
		sort: sort || {
			addedToDb: -1
		},
		skip: displayed || 0,
		limit: size || 20
	};
	var query = new mongo.MongoQuery(queryObject, models.ThinMovie.fields, options);
	return this._find(query, models.ThinMovie);
};

MovieService.prototype._find = function(mongoQuery, Model) {
	return this.movies.mongoFind(mongoQuery)
		.then(function(results) {
			if (Model) {
				return results.map(function(result) {
					return new Model(result);
				});
			} else {
				return results;
			}
		});
};

MovieService.prototype.findOne = function(query) {
	return this.movies.findOne(query)
		.then(function(result) {
			return models.FullMovie.create(result);
		});
};

MovieService.prototype.getById = function(id) {
	if (typeof id === "string") {
		id = parseInt(id, 10);
	}
	return this.findOne({
		id: id
	});
};

MovieService.prototype.checkIfExists = function(query) {
	return this.movies.checkIfExists(query);
};

MovieService.prototype.query = function(queryObject, sort, displayed, size) {
	return this._query(queryObject, sort, displayed, size);
};

//WRITE ACTIONS
MovieService.prototype.insert = function(movie) {
	var self = this;
	return this.checkIfExists({
		id: movie.id
	})
		.then(function(exists) {
			if (!exists) {
				movie.addedToDb = new Date();
				return self.movies.insert(movie)
					.then(function(movies){
						return movies.length ? movies[0] : null;
					});
			} else {
				throw new Error("Movie already exists");
			}
		});
};

MovieService.prototype.insertFromMovieDb = function(movie) {

};

MovieService.prototype.update = function(movieId, update) {
	return this.movies.updateOne({
		id: movieId
	}, update);
};

MovieService.prototype.remove = function(movieId) {
	if (typeof movieId === "string") {
		movieId = parseInt(movieId, 10);
	}
	return this.movies.remove({
		id: movieId
	});
};

MovieService.prototype.setTag = function(movieId, tag, value) {
	var updateObj = {};
	updateObj['tags.' + tag] = value;
	return this.update(movieId, updateObj);
};

MovieService.prototype.toggleWatched = function(movieId, watched) {
	return this.update(movieId, {
		watched: watched
	});
};

//HELPERS
MovieService.prototype.filmography = function(actorId) {
	var queryObj = {
		"casts.cast.id": actorId
	};
	var sort = {
		"release_date": -1
	};
	return this._query(queryObj, sort, 0, 2000);
};

MovieService.prototype.genres = function() {
	var aggregateActions = [{
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
	}];

	return this.movies.aggregate(aggregateActions);
};

var startsWithRegex = function(search) {
	var pattern = "^" + search + "|\\s" + search;
	return {
		"$regex": pattern,
		"$options": "i"
	};
};


MovieService.prototype.search = function(search, limit) {
	var self = this;
	var searchResults = {
		movies: [],
		people: []
	};

	return self.searchMovies(search, 5)
		.then(function(movieResults) {
			console.log("movieResults");

			searchResults.movies = movieResults;
			return self.searchActors(search, 5);
		})
		.then(function(actorResults) {
			searchResults.people = actorResults;
			return searchResults;
		});
};

MovieService.prototype.searchMovies = function(search, limit) {
	return this._query({
		title: startsWithRegex(search)
	}, null, 0, 5);
};
MovieService.prototype.searchActors = function(search, limit) {
	var aggregateActions = [{
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
		$match: {
			"_id.name": startsWithRegex(search)
		}
	}, {
		$sort: {
			count: -1
		}
	}, {
		$limit: limit || 5
	}];

	return this.movies.aggregate(aggregateActions);
};


MovieService.prototype.actors = function(count) {
	var aggregateActions = [{
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
	}];

	return this.movies.aggregate(aggregateActions);
};

MovieService.prototype._tagsQuery = function(tag) {
	var query = {};
	query[tag] = {
		$ne: null
	};

	var options = {
		sort: {}
	};
	options.sort[tag] = -1;

	var fields = models.ThinMovie.fields;
	return this._find(new mongo.MongoQuery(query, fields, options), models.ThinMovie);
};

MovieService.prototype.favorites = function() {
	return this._tagsQuery("tags.favorited");
};

MovieService.prototype.queue = function() {
	return this._tagsQuery("tags.queued");
};

module.exports = MovieService;