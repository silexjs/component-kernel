var Bundle = function() {};
Bundle.prototype = {
	name: null,
	path: null,
	
	getName: function() {
		if(this.name === null) {
			this.name = this.constructor.name;
		}
		return this.name;
	},
};


module.exports = Bundle;
