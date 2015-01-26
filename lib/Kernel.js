var pa = require('path');
var glob = require('glob');

var Log = USE('Silex.Component.Log.Log');
var Container = USE('Silex.Component.Container.Container');
var Dispatcher = USE('Silex.Component.Dispatcher.Dispatcher');
var Config = USE('Silex.Component.Config.Config');


var Kernel = function(env, logConfig, rootDir) {
	this.env = env || 'production';
	this.logConfig = logConfig || false;
	this.rootDir = rootDir || null;
	this.versionStrict = require(pa.resolve(__dirname, '../package.json')).version;
	this.version = this.versionStrict.replace(/^([0-9]+)\.([0-9]+)\.([0-9]+)$/, '$1.$2.x');
	this.startTime = (new Date()).getTime();
};
Kernel.prototype = {
	env: null,
	debug: false,
	logConfig: null,
	rootDir: null,
	versionStrict: null,
	version: null,
	startTime: null,
	bundles: [],
	log: null,
	container: null,
	config: null,
	dispatcher: null,
	
	init: function() {
		this.createLog();
		this.loadBundles();
		this.createContainer();
		this.createDispatcher();
		this.createConfig();
		this.loadConfig();
		this.loadContainer();
		this.initBundles();
		this.kernelReady();
	},
	initConsole: function(cmd) {
		this.logConfig.show = 'info';
		this.logConfig.write = 'info';
		this.init();
		this.createConsole(cmd);
		this.registerCommandsBundles();
		if(cmd === undefined) {
			this.resolveConsole();
		}
	},
	
	kernelReady: function() {
		this.dispatcher.dispatch('kernel.ready');
	},
	
	// -------------------------------------------------- Log zone
	createLog: function() {
		this.log = new Log({
			show: this.logConfig.show,
			write: this.logConfig.write,
		});
		this.debug = this.log.canShow('debug');
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
				this.log.debug('Kernel', 'Bundle "'+bundle.name+'" loaded');
			}
		}
	},
	initBundles: function() {
		for(name in this.bundles) {
			if(this.bundles[name].init !== undefined) {
				this.bundles[name].init(this, this.container);
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
					.set('kernel.log', this.log)
					.set('kernel.container', this.container)
					.set('kernel.config', this.config)
					.set('kernel.dispatcher', this.dispatcher);
		var services = {};
		for(var serviceName in this.config.data.services) {
			var service = this.config.data.services[serviceName];
			var priority = -(service.priority || 50);
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
					this.log.debug('Kernel', 'Service "'+serviceName+'" loaded ('+service.priority+')');
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
		var self = this;
		this.dispatcher = new Dispatcher({
			debug: this.debug,
			log: function(m) { self.log.debug('Dispatcher', m); },
		});
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
			var resources = glob.sync(this.getBundle(bundlename, true).dir+'/Resources/config/*.+('+Object.keys(this.config.loader.exts).join('|')+')');
			for(var i in resources) {
				this.config.load(resources[i]);
			}
		}
	},
	
	// -------------------------------------------------- Console zone
	createConsole: function(cmd) {
		if(cmd === undefined) {
			this.console = require('commander');
			this.console._name = 'node console.js';
			this.console.version(this.version+' ('+this.versionStrict+')');
		} else {
			this.console = cmd;
		}
	},
	resolveConsole: function() {
		if(process.argv.slice[2] === undefined) {
			this.console.help();
		} else {
			this.console.parse(process.argv);
		}
	},
};


module.exports = Kernel;
