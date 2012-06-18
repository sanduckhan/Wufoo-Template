var util = require('util');
var request = require('request');
var url = require("url");
var inline = require('./inline.js');

/*
 * Here we rewrite some Wufoo paths to JavaScript and CSS, since they're relative paths
 * rather than absolute ones. We also remove a Wufoo script tag (after form submission)
 * from the HTML, as this JavaScript will already be loaded client side as this point.
 */
updateWufooHTML = function(html, remove_script, cb) {
  inline({
    "html": html,
    "baseUrl": "https://wufoo.com",
    "removeScripts": remove_script
  }, function(err, processed_html) {
    if (err != null) {
      console.error('error inlining html:' + err);
    }
    return cb(processed_html);
  });
};

formDataToMultipart = function(form_data, cb) {
  var data = form_data;
  var multipart_data = [];

  form_data.forEach(function(field) {
    if (field.name != 'output' && typeof field.value != 'undefined') {
      if (field.name == 'clickOrEnter') {
        // clickOrEnter needs to be set to blank or 
        // multi-page forms won't work correctly
        field.value = '';
      }

      if (field.type == 'text') {
        if (field.value != '') {
          var multipart_part = {
            'Content-Disposition': 'form-data; name="' + field.name + '"',
            body: field.value,
          }
          multipart_data.push(multipart_part);
        }
      } else if (field.type == 'file') {
        if (field.value != '') {
          var multipart_part = {
            'Content-Disposition': 'form-data; name="' + field.name + '"; filename="' + field.filename + '.' + field.extension + '"',
            'Content-Type': 'image/' + field.extension,
            body: new Buffer(field.value, 'base64'),
          }
          multipart_data.push(multipart_part);
        }
      } else {
        console.log('Error, unknown field type: ' + field.type);
      }
    }
  });


  return multipart_data;
};

/* 
 * Here we get a Wufoo form's HTML, process it, and send it back to the client
 */
exports.getForm = function(params, callback) {
  var wufoo_config = require('wufoo_config.js');
  if (typeof wufoo_config == 'undefined') {
    return callback(null, {
      "html": "",
      "error": "No config."
    });
  }

  var domain = wufoo_config.wufoo_config.api_domain;
  var form_hash = params.form_hash;
  var url = "https://" + domain + "/forms/" + form_hash + "/";

  request(url, function(error, res, body) {
    updateWufooHTML(body, false, function(processed_html) {
      return callback(null, {
        "html": processed_html
      });
    });
  });
};

/* 
 * Here we get a list of available Wufoo forms
 */
exports.getForms = function(params, callback) {
  var wufoo_config = require('wufoo_config.js');
  if (typeof wufoo_config == 'undefined') {
    return callback(null, {
      "error": "No config."
    });
  }

  var domain = wufoo_config.wufoo_config.api_domain;
  var api_key = wufoo_config.wufoo_config.api_key;
  var forms_url = "https://" + domain + "/api/v3/forms.json";

  var auth = 'Basic ' + new Buffer(api_key + ':' + 'foostatic').toString('base64');
  var auth_header = {
    'Authorization': auth
  };

  request.get({
    url: forms_url,
    headers: auth_header
  }, function(error, res, body) {
    return callback(null, {
      data: JSON.parse(body)
    });
  });
};

/* 
 * Here we get submit a form to Wufoo, and return its
 * proxied response back to the client
 */
exports.submitForm = function(params, callback) {
  var multipart_data = formDataToMultipart(params.form_data);
  var req = request({
    method: 'POST',
    uri: params.form_submission_url,
    followAllRedirects: true,
    headers: {
      'content-type': 'multipart/form-data;'
    },
    multipart: multipart_data
  }, function(e, r, b) {
    console.log(r);
    updateWufooHTML(b, true, function(processed_html) {
      return callback(null, {
        "html": processed_html
      });
    });
  });
};

exports.postPicture = function(params, callback) {
  $fh.db({
    "act": "create",
    "type": "pictures",
    "fields": {
      "data": params.data,
      "ts": params.ts,
      "formUrl": params.formUrl,
      "transferred": false
    }
  }, function(err, data) {
    if (err) {
      console.log('Picture write failed');
      console.log("Error " + err);
      return callback(null, {
        status: "Fail"
      });
    } else {
      console.log('Picture wrote okay!');
/*setTimeout(function() {
        exports.transfer(function(err, ret) {
          console.log('transfer finished with status: ', ret);
        });
      }, 1); */
      return callback(null, {
        status: "Success"
      });
    }
  });
};

exports.getList = function(params, callback) {
  $fh.db({
    "act": "list",
    "type": "pictures"
  }, function(err, data) {
    return callback(null, {
      status: "ok",
      pictures: data
    });
  });
};

exports.deletePictures = function(params, callback) {
  $fh.db({
    "act": "list",
    "type": "pictures",
    "fields": ["ts", "transferred"]
  }, function(err, data) {
    var pictures = data.list;
    var picture_count = pictures.length;

    for (var i = 0; i < picture_count; i++) {
      var picture = pictures[i];
      var guid = picture.guid;

      $fh.db({
        "act": "delete",
        "type": "pictures",
        "guid": guid
      }, function(err, data) {});
    };

    return callback(null, {
      status: "ok"
    });
  });
};