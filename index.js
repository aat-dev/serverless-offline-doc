'use strict';
var yaml = require('js-yaml');
var path = require('path');
var _ = require('lodash');
var fs = require('fs');
var mkdirpSync = require('mkdirpsync');
var template = require('./template.js');

const makeObject = str => str.
  split(",").
  reduce(function(a,b,c){a[b]=c;return a},{});

var swaggerV2Props = makeObject(
  'swagger,info,host,basePath,'+
  'schemes,consumes,produces,'+
  'definitions,parameters,responses,'+
  'securityDefinitions,security,'+
  'tags,externalDocs'
);

var methodProps = makeObject(
  'tags,summary,description,'+
  'externalDocs,operationId,'+
  'consumes,produces,parameters,'+
  'responses,schemes,deprecated,'+
  'security'
);

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
            usage: 'Generates a local swagger v2 file from serverlees.yml annotations',
          },
        },
        options: {
          output: {
            usage: 'The name of the file to generate. Default: openapi.json',
            shortcut: 'o',
          },
          format: {
            usage: 'The type of the file to generate (json or yml). Default: json',
            shortcut: 'f',
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

    const documentation = _.pickBy(
        _.get(this, 'service.custom.documentation'),
        (value, key) => swaggerV2Props.hasOwnProperty(key)
      );

    //get the header properties
    Object.assign(retval, documentation);

    //get each if the paths, then extract the documentation fields into the in memory swagger file

    const httpList = [];

    //pull lambda function handlers out of serverlesses ridiculous structure
    _.toPairs(_.get(this, 'service.functions')).
      forEach(x => _.get(x, '[1].events').
      forEach(y => {
        if(y.hasOwnProperty('http')) {
          httpList.push(Object.assign({}, y.http));
        }
      }));

    httpList.forEach(item => {
      if(!retval.paths.hasOwnProperty(item.path)) {
        retval.paths[item.path] = {};
      }

      retval.paths[item.path][item.method] = _.pickBy(
          _.get(item, 'documentation'),
          (value, key) => methodProps.hasOwnProperty(key)
        );
    });

    const format = this.options.format || 'json';
    let output, outputName;

    if(format === 'yml') {
      outputName = this.options.output || 'openapi.yml';
      output = yaml.safeDump(retval);
    }
    else {
      outputName = this.options.output || 'openapi.json';
      output = JSON.stringify(retval);
    }

    var resolved = path.resolve(
        this.serverless.config.servicePath,
        outputName
      );

    mkdirpSync(path.dirname(resolved));

    fs.writeFileSync(resolved, output);

    console.log(`'${resolved}' file generated!`);
  }
};

module.exports = ServerlessPlugin;
