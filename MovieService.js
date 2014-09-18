"use strict";
var mongo = require("droopy-mongo"),
	config = require('./config'),
	models = require("CineProwl-Models"),
	q = require("q"),
	aggregates = require("./movieservice/aggregates"),
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
			}
			else {
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
					.then(function(movies) {
						return movies.length ? movies[0] : null;
					});
			}
			else {
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
	if (typeof actorId === "string") {
		actorId = parseInt(actorId, 10);
	}
	var queryObj = {
		"casts.cast.id": actorId
	};
	var sort = {
		"release_date": -1
	};
	return this._query(queryObj, sort, 0, 2000);
};

MovieService.prototype.genres = function() {
	return this.movies.aggregate(aggregates.genres());
};

var startsWithRegex = function(search) {
	var pattern = "^" + search + "|\\s" + search;
	return {
		"$regex": pattern,
		"$options": "i"
	};
};

MovieService.prototype.search = function(search, limit) {
	limit = limit || 5;
	var self = this;
	var searchResults = {
		movies: [],
		people: []
	};

	return self.searchMovies(search, limit)
		.then(function(movieResults) {
			console.log("movieResults");

			searchResults.movies = movieResults;
			return self.searchActors(search, limit);
		})
		.then(function(actorResults) {
			searchResults.people = actorResults;
			return searchResults;
		});
};

MovieService.prototype.searchMovies = function(search, limit) {
	limit = limit || 5;
	return this._query({
		title: startsWithRegex(search)
	}, null, 0, limit);
};

MovieService.prototype.searchActors = function(search, limit) {
	var aggregateActions = aggregates.searchActors(search, limit);

	return this.movies.aggregate(aggregateActions);
};

MovieService.prototype.actors = function(count) {
	var aggregateActions = aggregates.actors(count);

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

MovieService.prototype._genreStats = function(stats) {

	return this.movies.aggregate(aggregates.genreStats()).then(function(genresByWatched) {
		var genres = genresByWatched.reduce(function(prev, item) {
			if (item._id.id in prev) {

			}
			else {
				prev[item._id.id] = {
					name: item._id.id,
					watched: 0,
					unwatched: 0
				}
			}
			if (item._id.watched) {
				prev[item._id.id].watched = item.count;
			}
			else {
				prev[item._id.id].unwatched = item.count;
			}
			prev[item._id.id].count = prev[item._id.id].watched + prev[item._id.id].unwatched;
			prev[item._id.id].watchedRatio = (prev[item._id.id].watched / prev[item._id.id].count).toFixed(4);

			return prev;
		}, {});
	
		var genreArray = [];
		var keys = Object.keys(genres);
		keys.forEach(function(key){
			genreArray.push(genres[key]);
		})
		
		genreArray.sort(function(a, b){
			return  (a.watchedRatio < b.watchedRatio) ? 1 : -1;
		});
		stats.genres = genreArray;
		return stats;
	});
};

MovieService.prototype._movieStats = function(stats) {
	var allMovesQuery = {
		id: {
			$ne: null
		}
	};
	console.log(this);
	return this.query(allMovesQuery, null, 0, 2000).then(function(allMovies) {
		stats.totalCount = allMovies.length;
		var unwatched = allMovies.filter(function(movie) {
			return movie.watched === false;
		});
		stats.unwatched = unwatched.length;
		stats.watched = stats.totalCount - stats.unwatched;
		return stats;
	});
};

MovieService.prototype._yearStats = function(stats) {
	return this.movies.aggregate(aggregates.years()).then(function(years) {
		console.log(years);
		stats.years = years;
		return stats;
	});
};

MovieService.prototype.stats = function() {
	//total movies
	//total watched
	//total unwatched
	//watched/unwatched by genre
	//by decade
	var self = this;
	var stats = {};

	var genreStats = self._genreStats(stats);
	var movieStats = self._movieStats(stats);
	var yearStats = self._yearStats(stats);
	return q.all([genreStats, movieStats, yearStats]).then(function() {
		return stats
	});

}
module.exports = MovieService;