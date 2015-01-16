var pa = require('path');

var Container = USE('Silex.Component.Container.Container');
var Dispatcher = USE('Silex.Component.Dispatcher.Dispatcher');
var Config = USE('Silex.Component.Config.Config');
var glob = USE('Silex.Glob');


var Kernel = function(env, debug, rootDir) {
	this.env = env || 'production';
	this.debug = debug || false;
	this.rootDir = rootDir || null;
	this.startTime = (new Date()).getTime();
};
Kernel.prototype = {
	env:		null,
	debug:		null,
	rootDir:	null,
	startTime:	null,
	bundles:	[],
	container:	null,
	config:		null,
	dispatcher:	null,
	
	init: function() {
		this.loadBundles();
		this.createContainer();
		this.createDispatcher();
		this.createConfig();
		this.loadConfig();
		this.loadContainer();
		this.initBundles();
		this.dispatcher.dispatch('kernel.ready');
	},
	initConsole: function() {
		this.loadBundles();
		this.createContainer();
		this.createDispatcher();
		this.createConfig();
		this.loadConfig();
		this.loadContainer();
		this.createConsole();
		this.registerCommandsBundles();
		this.resolveConsole();
	},
	
	// -------------------------------------------------- Bundles zone
	loadBundles: function() {
		var bundles = this.registerBundles();
		for(i in bundles) {
			var bundle = new (USE(bundles[i]));
			bundle.name = bundles[i].substr(bundles[i].lastIndexOf('.')+1);
			bundle.path = SPACELOAD.getPath(bundles[i]);
			bundle.dir = pa.dirname(bundle.path);
			if(this.bundles[bundle.name] !== undefined) {
				throw new Error('The "'+bundle.name+'" bundle already exist');
			} else {
				this.bundles[bundle.name] = bundle;
			}
			if(this.debug === true) {
				console.log('KERNEL: Bundle "'+bundle.name+'" loaded');
			}
		}
	},
	initBundles: function() {
		for(name in this.bundles) {
			if(this.bundles[name].init !== undefined) {
				this.bundles[name].init();
			}
		}
	},
	registerCommandsBundles: function() {
		for(name in this.bundles) {
			if(this.bundles[name].registerCommands !== undefined) {
				this.bundles[name].registerCommands(this.console);
			}
		}
	},
	getBundle: function(name, createError) {
		var createError = createError || false;
		if(this.bundles[name] === undefined) {
			if(createError === false) {
				return null;
			} else {
				throw new Error('The "'+name+'" bundle does not exist');
			}
		}
		return this.bundles[name];
	},
	
	// -------------------------------------------------- Container zone
	createContainer: function() {
		this.container = new Container;
	},
	loadContainer: function() {
		this.container
					.set('kernel', this)
					.set('kernel.container', this.container)
					.set('kernel.config', this.config)
					.set('kernel.dispatcher', this.dispatcher);
		var services = {};
		for(var serviceName in this.config.data.services) {
			var service = this.config.data.services[serviceName];
			var priority = -service.priority;
			if(services[priority] === undefined) {
				services[priority] = [];
			}
			services[priority].push({
				serviceName: serviceName,
				service: service,
			});
		}
		for(var priority in services) {
			for(var i in services[priority]) {
				var serviceName = services[priority][i].serviceName;
				var service = services[priority][i].service;
				var useClass = USE(service.class);
				var arguments = [];
				if(service.arguments !== undefined) {
					for(var i in service.arguments) {
						var argument = service.arguments[i];
						if(argument.type !== undefined && argument.type === 'service') {
							arguments.push(this.container.get(argument.id));
						} else {
							arguments.push(argument);
						}
					}
				}
				var newClassApply = function(myClass, args) {
					var newClass = function() {
						myClass.apply(this, args);
					};
					newClass.prototype = myClass.prototype;
					return new newClass();
				};
				var serviceInstance = new newClassApply(useClass, arguments);
				this.container.set(serviceName, serviceInstance);
				if(this.debug === true) {
					console.log('KERNEL: Service "'+serviceName+'" loaded ('+service.priority+')');
				}
				if(service.events !== undefined) {
					for(var i in service.events) {
						var event = service.events[i];
						this.dispatcher.set(event.listener, [serviceInstance, event.method], event.priority, serviceName);
					}
				}
			}
		}
	},
	
	// -------------------------------------------------- Dispatcher zone
	createDispatcher: function() {
		this.dispatcher = new Dispatcher({ debug: this.debug });
	},
	
	// -------------------------------------------------- Config zone
	createConfig: function() {
		this.config = new Config;
		this.config.data.parameters = {
			'kernel.env': this.env,
			'kernel.debug': this.debug,
			'kernel.dir.root': this.rootDir,
			'kernel.dir.app': this.rootDir+'/app',
			'kernel.dir.cache': this.rootDir+'/app/cache/'+this.env,
		};
		this.config.data.services = {};
		var self = this;
		this.config.addEvent(function(value, file) {
			if(typeof value !== 'string') {
				return value;
			}
			return value.replace(/@([A-Za-z0-9]+)\//g, function(match, contents, offset, s) {
				var bundle = self.getBundle(contents);
				if(bundle === null) {
					throw new Error('[CONFIG] The "'+contents+'" bundle does not exist'+(file!==null?' in "'+file+'"':''));
				}
				return bundle.dir+'/';
			});
		}, 10);
		if(this.configLoader !== undefined) {
			this.configLoader(this.config);
		}
	},
	loadConfig: function() {
		if(this.configRegister !== undefined) {
			this.configRegister(this.config);
		}
		for(var bundlename in this.bundles) {
			var resources = glob(this.getBundle(bundlename, true).dir+'/Resources/config/*.('+Object.keys(this.config.loader.exts).join('|')+')');
			for(var i in resources) {
				this.config.load(resources[i]);
			}
		}
	},
	
	// -------------------------------------------------- Console zone
	createConsole: function() {
		this.console = new (USE('Silex.Component.Console.Console'));
	},
	resolveConsole: function() {
		this.console.resolve(process.argv);
	},
};


module.exports = Kernel;
