'use strict';
var jsYaml = require('js-yaml');
var path = require('path');
var _ = require('lodash');
var fs = require('fs');

var encodeCycles = arg => {
  let currentPath = "$";
  const seenObjectPaths = [],
  seenObjects = [],
  inner = arg => {
    //don't need to recurse as it's not an object
    if (typeof(arg) !== "object" || arg === null) {
      return arg;
    }

    //if seen object then just return the ref
    for (let i = seenObjects.length;i--;) {
      if (seenObjects[i] === arg) {
        return { "$ref" : seenObjectPaths[i] };
      }
    }

    seenObjects.push(arg);
    seenObjectPaths.push(currentPath);

    //loop over keys
    const clone = Array.isArray(arg) ? [] : {};
    //let isDifferent = false;

    for (const prop in arg) {
      if (typeof arg !== 'undefined' && typeof arg.hasOwnProperty === 'function' && arg.hasOwnProperty(prop)) {
        const escaped = '[' + (String(Math.floor(Number(prop)))===prop?
          prop
        :
          "'" + prop.replace("\\","\\\\").replace("'", "\\'") + "'"
        ) + ']';
        
        currentPath += escaped;
        const value = inner(arg[prop]);
        currentPath = currentPath.slice(0, -escaped.length);

        /*
        if(value !== arg[prop]) {
          isDifferent = true;
        }
        */

        clone[prop] = value;
      }
    }

    /*
    if(!isDifferent) {
      return arg;
    }
    */

    return clone;
  };

  return inner(arg);
};;

var jsonify = arg => {console.log(JSON.stringify(encodeCycles(arg), null, 2))}

var template = require('./template.js');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.serverlessLog = serverless.cli.log.bind(serverless.cli);
    this.options = options;
    this.exitCode = 0;
    this.provider = 'aws';
    this.start = this.start.bind(this);

    this.commands = {
      docs: {
        usage: 'Generates a local swagger.json file of serverless-aws-documentation fields',
        lifecycleEvents: ['start'],
        // add start nested options
        commands: {
          start: {
            usage: 'Simulates API Gateway to call your lambda functions offline using backward compatible initialization.',
          },
        },
        options: {
          output: {
            usage: 'The file of the file to generate. Default: ./swagger.json',
            shortcut: 'o',
          },
        },
      },
    };

    this.hooks = {
      'docs:start': this.start.bind(this),
    };
  }

  start() {
    this._checkVersion();

    this._generateDocs();
    return Promise.resolve();
  
  }

  _checkVersion() {
    const version = this.serverless.version;
    if (!version.startsWith('1.')) {
      this.serverlessLog(`Offline requires Serverless v1.x.x but found ${version}. Exiting.`);
      process.exit(0);
    }
  }

  _generateDocs() {
    const retval = template();

    const info = _.get(this, 'service.custom.documentation.info');
 
    //fs.writeFileSync('./output.json', JSON.stringify(encodeCycles(this.serverless), null, 2));

    //get the header properties
    Object.assign(retval.info, info);

    retval.paths = {};

    //get each if the paths, then extract the documentation fields into the in memory swagger file

    const httpList = [];

    //pull lambda function handlers out of serverlesses ridiculous structure
    Object.
      entries(_.get(this, 'service.functions')).
      map(x => x[1].events).
      forEach(y => y.forEach(z => {
        if(z.hasOwnProperty('http')) {
          httpList.push(Object.assign({}, z.http));
        }
      }));

    httpList.forEach(item => {
      let description;
      let parameters;
      let responses;

      const documentation = _.get(item, 'documentation');

      if(documentation) {
        description = documentation.description;
        
        parameters = [].
          //get the path parameters
          concat((documentation.pathParams || []).map(item => {
            const retval = Object.assign({}, item);
            retval['in'] = "path";
            return retval;
          })).

          //get the query paramenters
          concat((documentation.queryParams || []).map(item => {
            const retval = Object.assign({}, item);
            retval['in'] = "query";
            return retval;
          }));

        //get the method responses types
        responses = _.keyBy(
          Object.assign({}, documentation.methodResponses),
          'statusCode'
        );

        //remove the statusCode properties
        Object.entries(responses).forEach(item => {
          delete item[1].statusCode;
        });
      }

      if(!retval.paths.hasOwnProperty(item.path)) {
        retval.paths[item.path] = {};
      }

      retval.paths[item.path][item.method] = {
        description,
        produces: ["application/json"],
        parameters,
        responses
      }; 

    });

    jsonify(retval);

  }
};



module.exports = ServerlessPlugin;
