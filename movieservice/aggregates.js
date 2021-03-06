var startsWithRegex = function(search) {
	var pattern = "^" + search + "|\\s" + search;
	return {
		"$regex": pattern,
		"$options": "i"
	};
};

exports.genres = function() {
    return  [{
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
};
exports.years = function() {
	return [{
		$project: {
				year: { $substr: ["$release_date", 0, 4]}
			}
		}, {
		$group: {
			_id: "$year",
			count: { $sum: 1 }
		}
		}, {
			$sort: { _id: -1 }
	}];
}
exports.genreStats = function() {
    return  [{
		$project: {
			genres: 1,
			title: 1,
			watched: 1
		}
	}, {
		$unwind: "$genres"
	}, {
		$group: {
			_id: {
				id: "$genres.name",
				watched: "$watched"
			},
			count: {
				$sum: 1
			}
		}
	}, {
		$sort: {
			count: -1
		}
	}];
};

exports.actors = function (count) {
    return [{
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
};

exports.searchActors = function(search, limit){
    return [{
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
};