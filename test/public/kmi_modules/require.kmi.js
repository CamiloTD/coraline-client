/*
*
*	Author: "Camilo Torres"
*
*/
require = (function(){
	/* @require(String path[, String caller_folder]) throws BADTYPE, UNKEXT
	 *
	 * + Check if the path has been cached
	 * 	- If it is cached, then return the cached module
	 * + Search for a module handler that matches 'path'
	 * 	- If not Exist, throw an UNKEXT Error
	 * + Execute the module handler
	 *	- If returns false, then returns undefined
	 *	+ If module.disposable flag is not activated, then cache the module
	 * + Returns the loaded module
	 */

		function require (path, caller_folder) {
			/* Check if types are correct */
				caller_folder = caller_folder || '';
				if(typeof path !== "string")
					throw { code: 'BADTYPE', message: "Module path must be a String." };
				if(typeof caller_folder !== "string")
					throw { code: 'BADTYPE', message: "Module caller_folder must be a String." };
			/* Get extension (.js) by default */
				var ext = path.substring(path.lastIndexOf('/'));

				if(ext.indexOf(".") === -1){
					ext = "js";
					path = `${path}.js`;
				} else{
					ext = ext.substring(ext.lastIndexOf('.') + 1);
				}
			/* If cached, then return cache */
				if(require.modules[path])
					return require.modules[path].exports;
			/* Get Module handler and prepare module */
				var handler = require.getHandler(ext);
				var module = { exports: {}, path: path, caller_folder: caller_folder };
			/* Handler execution */
				if(handler) {
					var res = handler(path, module); // Load Module

					if(res === false) // If Module === false, returns
						return;

					if(!module.disposable) require.modules[path] = module; // If module.disposable flag is not activated, then cache

					return module.exports; // return the module.exports
				} else throw { code: 'UNKEXT', message: `Unknown Extension ${ext} for ${path}` }; // Throw if no handler found
		 }

	/* @require.resolve(String path, String base[, String parent]);
	 *
	 * Resolve a relative path to an absolute one with the following rules:
	 *
	 * 1) If the path starts with '/', 'http://' or 'https://' then returns exactly the same path
	 *	  Examples:
	 *		+ require.resolve('/module', '/') ==> '/module'
	 *		+ require.resolve('/', '/') ==> '/'
	 *		+ require.resolve('/path/to/module', '/') ==> '/path/to/module'
	 *		+ require.resolve('http://www.myhost.com/module', '/') ==> 'http://www.myhost.com/module/module'
	 *		+ require.resolve('https://www.myhost.com/my/module', '/') ==> 'https://www.myhost.com/my/module'
	 *
	 * 2) If the path starts with './' then, appends `path` to `base`
	 *	  Examples:
	 *		+ require.resolve('./module', '/my/path') ==> '/my/path/module'
	 *		+ require.resolve('./to/module', '/my/path') ==> '/my/path/to/module'
	 *
	 * 3) If the path starts with one or more '../', will go back the base folder till the '../' are consumed
	 *	  Examples:
	 *		+ require.resolve('../module', '/path/to') ==> '/path/module'
	 *		+ require.resolve('../../module', '/path/to') ==> '/module'
	 *		+ require.resolve('../../../module', '/path/to') ==> '/module'
	 *
	 * 4) If the path starts with '$' then resolve from `parent` instead of `base`
	 *	  Examples:
	 *		+ require.resolve('$module', '/path/to', '/parent') ==> '/parent/module'
	 *		+ require.resolve('$my/module', '/path/to', '/') ==> '/my/module'
	 *		+ require.resolve('$path/to/module', '/path/to', '/folder') ==> '/folder/path/to/module'
	 *
	 * 5) If any of the aboves matches, then resolve from "cami_modules" instead of base
	 *	  Examples:
	 *		+ require.resolve('module', '/path/to') ==> 'cami_modules/module'
	 *		+ require.resolve('my/module', '/path/to') ==> 'cami_modules/my/module'
	 *		+ require.resolve('path/to/module', '/path/to') ==> 'cami_modules/path/to/module'
	 */
		require.resolve = (path, base, parent) => {
			/* If http:// or https:// returns `path` */
				if(path.substr(0, 7) === "http://" || path.substr(0, 8) === "https://")
					return path;
			/* If starts with '$' then change `base` to `parent`, and shift `path` */
				if(path[0] === "$"){
					base = parent;
					path = path.substring(1);
				}
			/* If starts with '../' */
				if(path[0] === "." && path[1] === "." && path[2] === "/"){
					/* While starts with '../' */
						while(path[0] === "." && path[1] === "." && path[2] === "/"){
							base = base.substring(0, base.lastIndexOf('/')); // Update `base`
							path = path.substring(3); // Update `path`
						}

					return `${base}/${path}`;
				}
			/* If starts with './' resolve from `base` */
				if(path[0] === "." && path[1] === "/")
					return `${base}/${path.substr(2)}`;
			/* If starts with "/" returns `path` */
				if(path[0] === "/")
					return path;

			return `/kmi_modules/${path}`; // Resolve from 'kmi_modules'
		 }

	/* Handler wrappers */
		require.setHandler = (ext, fn) => require.handlers[ext.toLowerCase()] = fn;
		require.getHandler = (ext) => {
			var handler = require.handlers[ext.toLowerCase()];
			if(typeof handler === 'string')
				return require.getHandler(handler);

			return handler;
		}
	/* Default Handlers */
		require.handlers = {
			/* @require.handlers.js(String path, String module) throws MODULE_NOT_FOUND
			 *
			 *	Search and load a JS module, first, check for path.js file, then for path/index.js
			 *
			 *	+ Check if there is an active bundle for the module and load it
			 *		- If there isnt, then load the content via SYNCHRONOUS ajax, then create an anonymous function for it
			 *	+ Execute the loaded function
			 *		- If error ocurred then print it (SHOULD BE IMPROVED!!!)
			 */
				js: (path, module) => {
					// Check for bundles
						var bundle = require.bundles[path]; // Check in require.bundles object
						var folder;

						// If not exists
							if(!bundle){
								// Search for bundle/index.js
								bundle = require.bundles[`${path.substring(0, path.length - 3)}/index.js`];
								// If exists, then shift `folder`
									if(bundle)
										folder = path.substring(0, path.length - 3);
							}
					// Function Load
						if(!bundle) {
							// Request file via ajax
								var request = GET(path);

							if(request.status === 404){ // If not found
								path =`${path.substring(0, path.length - 3)}/index.js`; // Adjust path to /index.js
								request = GET(path); // Request
							}

							if(request.status === 404) // If module not found
								throw { code: "MODULE_NOT_FOUND", message: `Module '${path}' not found.` };

							var content = request.responseText; // Get the plain text

							content = `//# sourceURL=${path}\n${content}`;

							folder = path.substring(0, path.lastIndexOf('/')); // Get the base folder

							var fn = new Function(['require', '__dirname', 'module', 'exports', 'caller_folder'], content);

						} else var fn = bundle; // If there is a bundle, just use the bundle!

					fn((p) => require(require.resolve(p, folder, module.caller_folder), folder), folder, module, module.exports, module.caller_folder);
				}
		};
		/* Appends CSS to head (Its cached, so just load once per path) */
			require.setHandler('css', (path, module) => {
				var element = document.createElement('link');

				element.rel  = "stylesheet";
				element.type = "text/css";
				element.href = path;

				document.getElementsByTagName('head')[0].append(element);


				module.exports = { type: 'css', path: path };
			});

		/* Load HTML code, no cache, be aware of it, if u have some faster version, plz pull it */
					
		require.setHandler('html', (path, module) => {
			var request = GET(path);
			var content = request.responseText;

			if(request.status === 404) // If module not found
				throw { code: "MODULE_NOT_FOUND", message: `Module '${path}' not found.` };


			var div = document.createElement('div');
		  	div.innerHTML = content;

		  	return div.firstChild;
		});


		/* Load TxT File, NO CACHE */
			require.setHandler('txt', (path, module) => {
				var request = GET(path);
				var content = request.responseText;

				if(request.status === 404) // If module not found
					throw { code: "MODULE_NOT_FOUND", message: `Module '${path}' not found.` };

				module.exports = content;
				module.disposable = true;
			});
		/* Create an Image from URL (path) */
			require.setHandler('img', (path, module) => {
				module.exports = new Image();

				module.exports.src = path;

				module.disposable = true;
			});
		/* Extra Image formats */
			require.setHandler('bmp', 'img');
			require.setHandler('gif', 'img');
			require.setHandler('png', 'img');
			require.setHandler('jpg', 'img');

		/* Load a JSON object from file (Not cached) */
			require.setHandler('json', (path, module) => {
				module.exports = JSON.parse(GET(path).responseText);
				module.disposable = true;
			});

		/* Load Audio (Not module-cached) */
			require.setHandler('audio', (path, module) => {
				module.exports = new Audio(path);
				module.disposable = true;
			});

			require.setHandler('wav', 'audio');
			require.setHandler('mp3', 'audio');


	/* HTTP Get */
		function GET(url){
			var rq = new XMLHttpRequest();

			rq.open('GET', url, false);

			rq.send(null);

			if(url.substring(0, 7) === "file") // If its file:// protocol
				rq.status = rq.status? 404 : 200; // Set to standart... 0 = 200, anything else = 404

			return rq;
		}

	/* Require Properties */
		require.modules = {}; // Cache for modules
		require.bundles = {}; // Bundles, required for packing (Coming soon...)

	/* Main function (Im not sure about this, if u have a new suggestion, plz tell me) */
		window.addEventListener('load', function () {
			var meta = document.getElementsByTagName('meta');

			for(var i=0, entry;entry=meta[i++];){
				var path = entry.getAttribute('kmi-init');
				console.log(path)
				if(path)
					require(path);
			};
		});
		
	return require;
})();
