$(function () {
	var showCoordinations = true;
	var $types = $('.types');
	var onResize = function () {
		$types.css({
			maxHeight: $(window).height() - parseInt($types.css('marginTop'), 10) - parseInt($types.css('marginBottom'), 10) - parseInt($('header').height()) + 6,
		});
	};

	onResize();

	$(window).resize(onResize);

	var currentMarker;

	var timestampToSeconds = function (stamp) {
		stamp = stamp.split(':');
		return parseInt(stamp[0], 10) * 60 + parseInt(stamp[1], 10);
	};

	Handlebars.registerHelper('timestampToSeconds', timestampToSeconds);
	Handlebars.registerHelper('ifEquals', function (arg1, arg2, options) {
		return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
	});

	var Vent = _.extend({}, Backbone.Events);

	var LocationModel = Backbone.Model.extend({
		initialize: function () {
			var polyCoords = this.get('latlngarray');

			var marker = new google.maps.Polygon({
				paths: polyCoords,
				strokeColor: '#' + this.get('strokecolor'),
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: '#' + this.get('fillcolor'),
				fillOpacity: 0.35,
				zIndex: this.get('order') || 0,
			});

			var bounds = new google.maps.LatLngBounds();
			polyCoords.forEach(function (element, index) {
				bounds.extend(element);
			});

			var mapLabel = new MapLabel({
				position: bounds.getCenter(),
				text: this.get('title'),
				strokeWeight: 1,
				strokeColor: '#000000',
				fontColor: '#' + this.get('fillcolor'),
				zIndex: 10000,
			});

			_.bindAll(this, 'markerClicked');
			google.maps.event.addListener(marker, 'click', this.markerClicked);
			this.set({ marker: marker, label: mapLabel });
		},

		toJSON: function () {
			var json = Backbone.Model.prototype.toJSON.call(this);
			if (this.collection) {
				json._index = this.collection.indexOf(this);
				if (this.collection.url) {
					json._file = this.collection.url.split('/').pop();
				}
			}
			return json;
		},

		markerClicked: function () {
			Vent.trigger('location:clicked', this);
		},

		removeHighlight: function () { },

		highlightMarker: function () {
			if (currentMarker == this) {
				Vent.trigger('location:clicked', this);
			} else {
				if (currentMarker) {
					currentMarker.removeHighlight();
				}
				mapView.closePopupLocation();
				currentMarker = this;
			}
		},
	});
	var LocationsCollection = Backbone.Collection.extend({
		model: LocationModel,
	});
	var CategoryModel = Backbone.Model.extend({
		initialize: function () {
			this.name = this.get('name');
			this.icon = this.get('icon');
			this.enabled = this.get('enabled');
			this.locations = new LocationsCollection;
			this.locations.url = this.get('url');
			this.locations.on('add', function (model) {
				if (this.get('enabled')) {
					Vent.trigger('locations:visible', this.locations.models);
				}
			}, this);
		},

		fetch: function () {
			this.locations.fetch();
		},
	});
	var CategoriesCollection = Backbone.Collection.extend({
		model: CategoryModel,
		fetch: function () {
			this.chain().each(function (c) { c.locations.fetch() });
		},
	});
	var SectionModel = Backbone.Model.extend({
		initialize: function () {
			this.name = this.get('name');
			this.categories = this.get('categories');
		},
	});
	var SectionCollection = Backbone.Collection.extend({
		model: SectionModel,
		fetch: function () {
			this.chain().each(function (s) { s.categories.fetch() });
		},
		forView: function (type) {
			return this.map(function (s) {
				return {
					name: s.name,
					categories: s.categories.map(function (c) {
						return c.toJSON();
					}),
				};
			});
		},
	});
	var sections = new SectionCollection([
		new SectionModel({
			name: 'General',
			categories: new CategoriesCollection([
				new CategoryModel({
					name: 'Neighborhoods',
					icon: 'radar/radar_warehouse.png',
					enabled: false,
					url: 'data/neighborhoods.json',
				}),
				new CategoryModel({
					name: 'Neutral',
					icon: 'General/glitches.png',
					enabled: true,
					url: 'data/neutral.json',
				}),
				new CategoryModel({
					name: 'Automotive',
					icon: 'radar/radar_acsr_race_hotring.png',
					enabled: true,
					url: 'data/automotive.json',
				}),
				new CategoryModel({
					name: 'Medical',
					icon: 'radar/radar_hospital.png',
					enabled: true,
					url: 'data/medical.json',
				}),
			]),
		}),
		new SectionModel({
			name: '4.0',
			categories: new CategoriesCollection([
				new CategoryModel({
					name: 'Territories',
					icon: 'General/wall-breach.png',
					enabled: true,
					url: 'data/territories.4.json',
				}),
				new CategoryModel({
					name: 'Weed Turf',
					icon: 'radar/radar_weed_stash.png',
					enabled: true,
					url: 'data/weed_turf.json',
				}),
				new CategoryModel({
					name: 'Heists',
					icon: 'radar/radar_heist.png',
					enabled: true,
					url: 'data/heists.4.json',
				}),
				new CategoryModel({
					name: 'Legal',
					icon: 'radar/radar_police_station.png',
					enabled: true,
					url: 'data/legal.4.json',
				}),
				new CategoryModel({
					name: 'Restaurants',
					icon: 'radar/radar_bar.png',
					enabled: true,
					url: 'data/restaurants.4.json',
				}),
			]),
		}),
		new SectionModel({
			name: '3.0',
			categories: new CategoriesCollection([
				new CategoryModel({
					name: 'Territories',
					icon: 'General/wall-breach.png',
					enabled: false,
					url: 'data/territories.3.json',
				}),
				new CategoryModel({
					name: 'Heists',
					icon: 'radar/radar_heist.png',
					enabled: false,
					url: 'data/heists.3.json',
				}),
				new CategoryModel({
					name: 'Legal',
					icon: 'radar/radar_police_station.png',
					enabled: false,
					url: 'data/legal.3.json',
				}),
				new CategoryModel({
					name: 'Restaurants',
					icon: 'radar/radar_bar.png',
					enabled: false,
					url: 'data/restaurants.3.json',
				}),
			]),
		}),
	]);

	var showingLabels;
	var CategoriesView = Backbone.View.extend({
		initialize: function () {
			this.template = Handlebars.compile($('#sectionTemplate').html());
		},

		render: function () {
			this.$el.html(
				this.template({
					sections: sections.forView(),
				})
			);
			$('#typeDetails').hide();
			return this;
		},

		events: {
			'change input': 'toggleLocations',
			'click .details': 'showDetails',
		},

		toggleLocations: function (e) {
			var $e = $(e.currentTarget),
				name = $e.val(),
				section = $e.data('section'),
				showLocations = $e.is(':checked');

			if (name == 'labels') {
				var allLocations = sections.chain()
					.map(function (s) {
						return s.categories.filter(function (c) {
							return c.get('enabled');
						});
					})
					.flatten()
					.map(function (c) {
						return c.locations.models;
					})
					.flatten()
					.value();

				if (showLocations) {
					Vent.trigger('labels:visible', allLocations);
					showingLabels = true;
				} else {
					Vent.trigger('labels:invisible', allLocations);
					showingLabels = false;
				}
				return;
			}

			category = sections.findWhere({ name: section }).categories.findWhere({ name: name });
			category.set('enabled', showLocations);

			var models = category.locations.models;
			if (showLocations) {
				Vent.trigger('locations:visible', models);
				if (showingLabels) {
					Vent.trigger('labels:visible', models);
				}
			} else {
				Vent.trigger('locations:invisible', models);
				if (showingLabels) {
					Vent.trigger('labels:invisible', models);
				}
			}
		},

		showDetails: function (e) {
			e.preventDefault();
			var section = $(e.currentTarget).data('section');
			var name = $(e.currentTarget).data('name');
			this.$el
				.find('input[value="' + name + '"][data-section="' + section + '"]')
				.prop('checked', true)
				.trigger('change');

			var details = new CategoryDetailsView({
				el: '#typeDetails',
				section: section,
				category: name,
			});
			details.render();
		},
	});

	var CategoryDetailsView = Backbone.View.extend({
		initialize: function () {
			this.template = Handlebars.compile($('#categoryDetailsTemplate').html());
		},

		events: {
			'click a.back': 'goBack',
			'click li': 'showMarker',
		},

		goBack: function (e) {
			e.preventDefault();
			this.$el.empty();
			this.off();
			$('#types').show();
		},

		showMarker: function (e) {
			var section = $(e.currentTarget).data('section');
			var name = $(e.currentTarget).data('name');

			var location = sections.findWhere({ name: section }).categories.findWhere({ name: name }).locations.findWhere({ title: $(e.currentTarget).text() });

			location.highlightMarker();
			var bounds = new google.maps.LatLngBounds();
			location
				.get('marker')
				.getPath()
				.forEach(function (element, index) {
					bounds.extend(element);
				});
			map.panTo(bounds.getCenter());
			map.setZoom(7);
		},

		render: function () {
			var section = this.options.section;
			var category = this.options.category;
			var locs = sections.findWhere({ name: section }).categories.findWhere({ name: category }).locations.models;

			this.$el.html(
				this.template({
					section: section,
					category: category,
					locations: _(locs).map(function (x) {
						var d = x.toJSON();
						return d;
					}),
				})
			);
			$('#types').hide();
			this.$el.show();
			return this;
		},

	});

	var MapView = Backbone.View.extend({
		initialize: function () {
			this.mapType = 'Atlas';
			this.mapDetails = {
				'Atlas': '#0FA8D2',
				'Satellite': '#143D6B',
				'Road': '#1862AD',
			};

			this.mapOptions = {
				center: new google.maps.LatLng(-60, -20),
				zoom: 3,
				disableDefaultUI: true,
				mapTypeId: this.mapType,
				backgroundColor: 'hsla(0, 0%, 0%, 0)',
			};

			_.bindAll(this, 'getTileImage', 'updateMapBackground');

			this.popupTemplate = Handlebars.compile($('#markerPopupTemplate2').html());

			this.listenTo(Vent, 'locations:visible', this.showLocations);
			this.listenTo(Vent, 'locations:invisible', this.hideLocations);
			this.listenTo(Vent, 'labels:visible', this.showLabels);
			this.listenTo(Vent, 'labels:invisible', this.hideLabels);
			this.listenTo(Vent, 'location:clicked', this.popupLocation);
		},

		render: function () {
			// Function to update coordination info windows
			function updateCoordinationWindow(markerobject) {
				function getContent(evt) {
					return '</p><p>{"lat": ' + evt.latLng.lat().toFixed(3) + ', "lng": ' + evt.latLng.lng().toFixed(3) + '},</p>';
				}

				// Create new info window
				var infoWindow = new google.maps.InfoWindow();

				// onClick listener
				google.maps.event.addListener(markerobject, 'click', function (evt) {
					infoWindow.setOptions({ content: getContent(evt) });

					// Open the info window
					infoWindow.open(map, markerobject);
				});

				// onDrag listener
				google.maps.event.addListener(markerobject, 'drag', function (evt) {
					infoWindow.setOptions({ content: getContent(evt) });
				});

				// delete listener
				google.maps.event.addListener(markerobject, 'rightclick', function (evt) {
					const index = window.locs.indexOf(markerobject);
					if (index > -1) {
						window.locs.splice(index, 1);
						markerobject.setMap(null);
						window.locs.forEach(function (item, index) {
							item.setLabel(String(index));
						});
					}
				});
			}

			var map = (this.map = window.map = new google.maps.Map(this.el, this.mapOptions));

			this.initMapTypes(map, _.keys(this.mapDetails));

			google.maps.event.addListener(map, 'maptypeid_changed', this.updateMapBackground);

			google.maps.event.addDomListener(map, 'tilesloaded', function () {
				if ($('#mapControlWrap').length == 0) {
					$('div.gmnoprint').last().wrap('<div id="mapControlWrap" />');
				}
			});

			window.locs = [];
			google.maps.event.addListener(map, 'rightclick', function (e) {
				var marker = new google.maps.Marker({
					map: map,
					moveable: true,
					draggable: true,
					position: e.latLng,
					label: String(window.locs.length),
				});
				window.locs.push(marker);
				// Check if coords mode is enabled
				if (showCoordinations) {
					// Update/create info window
					updateCoordinationWindow(marker);
				}
			});

			return this;
		},

		getMap: function () {
			return this.map;
		},

		initMapTypes: function (map, types) {
			_.each(
				types,
				function (type) {
					var mapTypeOptions = {
						minZoom: 1,
						maxZoom: 7,
						name: type,
						getTileUrl: this.getTileImage,
					};
					map.mapTypes.set(type, new google.maps.ImageMapType(mapTypeOptions));
				},
				this
			);
		},

		updateMapBackground: function () {
			this.mapType = this.map.getMapTypeId();
			this.$el.css({
				backgroundColor: this.mapDetails[this.mapType],
			});
		},

		getTileImage: function (rawCoordinates, zoomLevel) {
			var coord = this.normalizeCoordinates(rawCoordinates, zoomLevel);
			if (!coord) {
				return null;
			}
			return 'tiles/' + this.mapType.toLowerCase() + '/' + zoomLevel + '/' + coord.x + '_' + coord.y + '.png';
		},

		normalizeCoordinates: function (coord, zoom) {
			var y = coord.y;
			var x = coord.x;

			// tile range in one direction range is dependent on zoom level
			// 0 = 1 tile, 1 = 2 tiles, 2 = 4 tiles, 3 = 8 tiles, etc
			var tileRange = 1 << zoom;

			// don't repeat across y-axis (vertically)
			if (y < 0 || y >= tileRange) {
				return null;
			}

			// repeat across x-axis
			if (x < 0 || x >= tileRange) {
				x = ((x % tileRange) + tileRange) % tileRange;
			}

			return {
				x: x,
				y: y,
			};
		},

		showLocations: function (locations) {
			_.each(
				locations,
				function (location) {
					var marker = location.get('marker');
					if (!marker.getMap()) {
						marker.setMap(this.map);
					}
					marker.setVisible(true);
				},
				this
			);
		},

		showLabels: function (locations) {
			_.each(
				locations,
				function (location) {
					var label = location.get('label');
					if (!label.getMap()) {
						label.setMap(this.map);
					}
					label.set('fontSize', 16);
				},
				this
			);
		},

		hideLocations: function (locations) {
			_.each(locations, function (location) {
				location.get('marker').setVisible(false);
			});
		},

		hideLabels: function (locations) {
			_.each(locations, function (location) {
				var label = location.get('label');
				if (!label.getMap()) {
					label.setMap(this.map);
				}
				label.set('fontSize', 0);
			});
		},

		popupLocation: function (location, panTo) {
			var infoWindow = new google.maps.InfoWindow({
				content: this.popupTemplate(location.toJSON()),
			});

			infoWindow.setOptions({
				maxHeight: 400,
			});

			if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
				infoWindow.setOptions({
					maxWidth: 180,
					maxHeight: 300,
				});
			}
			var bounds = new google.maps.LatLngBounds();
			location
				.get('marker')
				.getPath()
				.forEach(function (element, index) {
					bounds.extend(element);
				});
			infoWindow.setPosition(bounds.getCenter());
			infoWindow.open(this.map);

			this.closePopupLocation();
			this.currentInfoWindow = infoWindow;
		},

		closePopupLocation: function () {
			if (this.currentInfoWindow) {
				this.currentInfoWindow.close();
			}
		},
	});

	var mapView = new MapView({
		el: '#map',
	});

	var categoriesView = new CategoriesView({
		el: '#types',
		map: mapView.getMap(),
	});

	sections.fetch();
	mapView.render();
	categoriesView.render();
});

function loadFiles() {
	$.get('/api/files', function (data) {
		var $select = $('#regionFile');
		$select.empty();
		data.forEach(function (file) {
			var selected = (file === 'territories.4.json') ? 'selected' : '';
			$select.append('<option value="' + file + '" ' + selected + '>' + file + '</option>');
		});
	});
}

function saveRegion() {
	// Edit modunda değilsek nokta kontrolü yap (Edit modunda noktalar değişmiyor olabilir, ama şimdilik nokta değişimi yok)
	// Eğer index -1 ise (yeni ekleme), window.locs kontrolü şart.
	// Eğer index > -1 ise (düzenleme), window.locs boş olabilir (noktaları değiştirmedik).
	// Basitlik için düzenlemede nokta değişimini şimdilik desteklemiyoruz, mevcut noktaları koruyoruz.

	var index = parseInt($('#regionIndex').val());
	var isEdit = index > -1;

	if (!isEdit && (!window.locs || window.locs.length < 3)) {
		alert('Please map at least 3 points on the map (Right Click) before saving.');
		return;
	}

	var title = $('#regionTitle').val();
	var notes = $('#regionNotes').val();
	var notes2 = $('#regionNotes2').val();
	var imageUrl = $('#regionImage').val();
	var imageTitle = $('#regionImageTitle').val();
	var videoId = $('#regionVideo').val();
	var filename = $('#regionFile').val();
	var color = $('#regionColor').val().replace('#', '');

	var videoFileInput = document.getElementById('videoFile');

	if (!title || !filename) {
		alert('Please fill in the title');
		return;
	}

	var latlngarray = [];
	if (isEdit) {
		// Edit modunda noktaları formdan alamıyoruz çünkü harita üzerindeki noktaları geri yüklemedik.
		// Bu basit versiyonda noktalar değişmeyecek, sunucu tarafında eski noktalar korunmalı mı?
		// Sunucu tarafındaki kodumuz tüm objeyi replace ediyor.
		// Bu yüzden Edit'e tıklandığında mevcut noktaları da global bir değişkene veya hidden bir yere almalıyız.
		// Ancak şu an haritada tıklandığında `window.locs` dolmuyor.
		// Çözüm: Basitlik için, edit modunda haritadaki noktaları değiştirmiyoruz (koordinat güncellemesi yok),
		// sadece metadataları güncelliyoruz.
		// Backend'e sadece değişen alanları göndermek lazım ama backend full replace yapıyor.
		// O zaman `editRegion` fonksiyonunda mevcut tüm veriyi (koordinatlar dahil) global bir değişkene atalım.
		if (window.currentRegionData && window.currentRegionData.latlngarray) {
			latlngarray = window.currentRegionData.latlngarray;
		}
	} else {
		for (var i = 0; i < window.locs.length; i++) {
			latlngarray.push({
				"lat": parseFloat(window.locs[i].position.lat().toFixed(3)),
				"lng": parseFloat(window.locs[i].position.lng().toFixed(3))
			});
		}
	}

	var regionData = {
		"title": title,
		"notes": notes,
		"notes2": notes2,
		"wiki_link": "",
		"order": 0,
		"strokecolor": color,
		"fillcolor": color,
		"latlngarray": latlngarray
	};

	// Eğer video dosyası varsa önce yükle
	if (videoFileInput.files && videoFileInput.files[0]) {
		var formData = new FormData();
		formData.append('videoFile', videoFileInput.files[0]);

		$.ajax({
			url: '/api/upload',
			type: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			success: function (uploadRes) {
				regionData.local_video = uploadRes.path;
				finalizeSave(filename, regionData, isEdit ? index : undefined);
			},
			error: function (err) {
				alert('Video upload failed: ' + JSON.stringify(err));
			}
		});
	} else {
		// Video dosyası yoksa, mevcut videoyu koru (edit ise) veya atla
		if (isEdit && window.currentRegionData && window.currentRegionData.local_video) {
			regionData.local_video = window.currentRegionData.local_video;
		}
		finalizeSave(filename, regionData, isEdit ? index : undefined);
	}

	// Geri kalanları finalizeSave içinde işle
	function finalizeSave(filename, regionData, index) {
		// Resim ve Youtube Video alanlarını ekle
		if (imageUrl) {
			regionData.images = [{ "id": 1, "headline": imageTitle || "Image", "url": imageUrl }];
		} else if (isEdit && window.currentRegionData && window.currentRegionData.images) {
			// Resim URL boşsa ama editteysek, eski resimleri koru MU? 
			// Kullanıcı resim URL'i sildiyse silinmeli. Input boşsa silinir.
		}

		if (videoId) {
			regionData.video = { "yt_id": videoId };
		} else if (isEdit && window.currentRegionData && window.currentRegionData.video) {
			// Benzer mantık, kullanıcı sildiyse silinmeli.
		}

		$.ajax({
			url: '/api/save-region',
			type: 'POST',
			contentType: 'application/json',
			data: JSON.stringify({ filename: filename, regionData: regionData, index: index }),
			success: function (response) {
				$('#addRegionModal').modal('hide');
				alert('Region saved successfully! The page will reload.');
				location.reload();
			},
			error: function (err) {
				alert('Error saving region: ' + JSON.stringify(err));
			}
		});
	}
}

function deleteRegion(filename, index) {
	if (confirm('Are you sure you want to delete this region?')) {
		$.ajax({
			url: '/api/delete-region',
			type: 'POST',
			contentType: 'application/json',
			data: JSON.stringify({ filename: filename, index: index }),
			success: function (response) {
				mapView.closePopupLocation();
				alert('Region deleted successfully!');
				location.reload();
			},
			error: function (err) {
				alert('Error deleting region: ' + JSON.stringify(err));
			}
		});
	}
}

function editRegion(filename, index) {
	// Veriyi bulmamız lazım. Backbone collection'larından arayabiliriz veya serverdan tekrar çekebiliriz.
	// Backbone'dan aramak en kolayı.
	// Section -> Category -> Location
	// Ancak elimizde filename var.
	// Tüm sections'ı gezip category url'i file olanı bulacağız.

	// `sections` global değişkenine erişebiliyoruz.
	var targetLocation = null;
	var targetCategory = null;

	sections.each(function (section) {
		section.categories.each(function (category) {
			// URL tam yol olabilir veya olmayabilir. app.js içinde url 'data/...' şeklindeydi.
			if (category.locations.url && category.locations.url.endsWith(filename)) {
				// Index ile modeli al
				var model = category.locations.at(index);
				if (model) {
					targetLocation = model;
					targetCategory = category;
				}
			}
		});
	});

	if (targetLocation) {
		window.currentRegionData = targetLocation.toJSON(); // Edit sırasında mevcut veriyi sakla

		$('#regionTitle').val(targetLocation.get('title'));
		$('#regionNotes').val(targetLocation.get('notes'));
		$('#regionNotes2').val(targetLocation.get('notes2'));
		$('#regionColor').val('#' + targetLocation.get('fillcolor'));

		// Resim
		var images = targetLocation.get('images');
		if (images && images.length > 0) {
			$('#regionImage').val(images[0].url);
			$('#regionImageTitle').val(images[0].headline);
		} else {
			$('#regionImage').val('');
			$('#regionImageTitle').val('');
		}

		// Video (Youtube)
		var video = targetLocation.get('video');
		if (video) {
			$('#regionVideo').val(video.yt_id);
		} else {
			$('#regionVideo').val('');
		}

		// Dosya seçimi
		loadFiles(); // Selecti doldur
		setTimeout(function () {
			$('#regionFile').val(filename);
			$('#regionFile').prop('disabled', true); // Dosya değiştirmeyi engelle (karmaşıklaşmasın)
		}, 500);

		$('#regionIndex').val(index);
		$('#addRegionModalLabel').text('Edit Region');
		$('#addRegionModal').modal('show');
	} else {
		alert('Region not found!');
	}
}

// Modal kapandığında resetle
$(document).ready(function () {
	$('#addRegionModal').on('hidden.bs.modal', function () {
		$('#addRegionForm')[0].reset();
		$('#regionIndex').val("-1");
		$('#addRegionModalLabel').text('Add New Region');
		$('#regionFile').prop('disabled', false);
		window.currentRegionData = null;
		window.locs = []; // Yeni çizim için sıfırla
	});
});

function toggleRuler() {
	addruler(window.map);
}

function toggleRuler() {
	addruler(window.map);
}

function addruler(map) {
	ruler1 = new google.maps.Marker({
		position: map.getCenter(),
		map: map,
		draggable: true,
	});

	ruler2 = new google.maps.Marker({
		position: map.getCenter(),
		map: map,
		draggable: true,
	});

	var ruler1label = new Label({ map: map, position: map.getCenter(), text: '0m' });

	rulerpoly = new google.maps.Polyline({
		path: [ruler1.position, ruler2.position],
		strokeColor: '#FFFF00',
		strokeOpacity: 0.7,
		strokeWeight: 8,
	});
	rulerpoly.setMap(map);

	google.maps.event.addListener(ruler1, 'drag', function () {
		ruler1label.set('position', ruler1.position);
		rulerpoly.setPath([ruler1.getPosition(), ruler2.getPosition()]);
		ruler1label.set('text', distance(ruler1.getPosition().lat(), ruler1.getPosition().lng(), ruler2.getPosition().lat(), ruler2.getPosition().lng()));
	});

	google.maps.event.addListener(ruler2, 'drag', function () {
		rulerpoly.setPath([ruler1.getPosition(), ruler2.getPosition()]);
		ruler1label.set('text', distance(ruler1.getPosition().lat(), ruler1.getPosition().lng(), ruler2.getPosition().lat(), ruler2.getPosition().lng()));
	});

	ruler1.setVisible(true);
	ruler2.setVisible(true);
	rulerpoly.setVisible(true);
}

function distance(lat1, lon1, lat2, lon2) {
	var um = 'km'; // km | ft (choose the constant)
	var R = 1800;
	if (um == 'ft') {
		R = 20924640; // ft
	}
	var dLat = ((lat2 - lat1) * Math.PI) / 180;
	var dLon = ((lon2 - lon1) * Math.PI) / 180;
	var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	var d = R * c * 4;
	return Math.round(d) + 'm';
}

// Define the overlay, derived from google.maps.OverlayView
function Label(opt_options) {
	// Initialization
	this.setValues(opt_options);

	// Label specific
	var span = (this.span_ = document.createElement('span'));
	span.style.cssText =
		'position: relative; left: 0%; top: -8px; ' +
		'white-space: nowrap; border: 0px; font-family:arial; font-weight:bold;' +
		'padding: 2px; background-color: #ddd; ' +
		'opacity: 1; ' +
		'filter: alpha(opacity=75); ' +
		'-ms-filter: "alpha(opacity=75)"; ' +
		'-khtml-opacity: 1; ' +
		'z-index:1000';

	var div = (this.div_ = document.createElement('div'));
	div.appendChild(span);
	div.style.cssText = 'position: absolute; display: none';
}
Label.prototype = new google.maps.OverlayView();

// Implement onAdd
Label.prototype.onAdd = function () {
	var pane = this.getPanes().overlayLayer;
	pane.appendChild(this.div_);

	// Ensures the label is redrawn if the text or position is changed.
	var me = this;
	this.listeners_ = [
		google.maps.event.addListener(this, 'position_changed', function () {
			me.draw();
		}),
		google.maps.event.addListener(this, 'text_changed', function () {
			me.draw();
		}),
	];
};

// Implement onRemove
Label.prototype.onRemove = function () {
	this.div_.parentNode.removeChild(this.div_);
	// Label is removed from the map, stop updating its position/text.
	for (var i = 0, I = this.listeners_.length; i < I; ++i) {
		google.maps.event.removeListener(this.listeners_[i]);
	}
};

// Implement draw
Label.prototype.draw = function () {
	var projection = this.getProjection();
	var position = projection.fromLatLngToDivPixel(this.get('position'));

	var div = this.div_;
	div.style.left = position.x + 'px';
	div.style.top = position.y + 'px';
	div.style.display = 'block';

	this.span_.innerHTML = this.get('text').toString();
};
