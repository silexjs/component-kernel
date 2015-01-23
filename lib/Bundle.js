var Bundle = function() {};
Bundle.prototype = {
	name: null,
	path: null,
	kernel: null,
	container: null,
	
	getName: function() {
		if(this.name === null) {
			this.name = this.constructor.name;
		}
		return this.name;
	},
	init: function(kernel, container) {
		this.kernel = kernel;
		this.container = container;
	},
};


module.exports = Bundle;
