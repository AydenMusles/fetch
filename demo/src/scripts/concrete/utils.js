/*
Task: Create a new url with a specified parameters value changed
Settings:
  url: Url that you wish to change
  paramName: Name of the parameter you want to change
  paramValue: the value you want to change it to
*/
concrete.replaceUrlParameter = function(url, paramName, paramValue){
    if (paramValue == null)
      paramValue = '';
    var pattern = new RegExp('\\b('+paramName+'=).*?(&|$)')
    if (url.search(pattern)>=0){
      return url.replace(pattern,'$1' + paramValue + '$2');
    }
    return url + (url.indexOf('?')>0 ? '&' : '?') + paramName + '=' + paramValue
}
/*
Task: Create a new url with a new url parameter and value, whilst maintaining the existing parameters and hash.
Settings:
  url: Url that you are wanting to change
  paramName: the parameter name you want to add
  paramValue: the value of the parameter you want to add
  replace: Default is true. When true if you try to add a parameter that already exists in the url it will be over written.
*/
concrete.addUrlParameter = function(url, paramName, paramValue, replace) {
  replace = replace || true;
  var locat = url.split('?')[1] || '';
  var exists = locat.indexOf(paramName+'=') > -1 ? true : false;
  var urlSplit = url.split('#');
  var hash = urlSplit[1] ? '#'+ urlSplit[1] : '';
  Object.keys(concrete.getUrlParameters(locat)).length ? urlSplit[0]+='&' : urlSplit[0]+='?';

  if (replace && exists) {
    return concrete.replaceUrlParameter(url, paramName, paramValue)+hash;
  } else {
    return urlSplit[0]+paramName+'='+paramValue+hash;
  }
};
/*
Task: Apply or replace a series of parameters
Settings:
  url: Url that you are wanting to change
  paramString: a string of url parameters eg. page=1&foo=bar
*/
concrete.addUrlParameters = function(url, paramString) {
  var params = paramString.split('&');
  var allParams = concrete.getUrlParameters(url);
  for (var i = 0; i < params.length; i++) {
    var param = params[i].split('=');

    if (allParams.hasOwnProperty(param[0])){
      url = concrete.replaceUrlParameter(url, param[0], param[1]);
    } else {
      url = concrete.addUrlParameter(url, param[0], param[1]);
    }
  }
  return url;
};
/*
Task: Return a url with a specified parameter and it's value removed
Settings:
  url: Url that you are wanting to change
  paramName: The name of the parameter you want to remove, it's value will also be removed
*/
concrete.removeUrlParameter = function(url, paramName) {
  // Use this function incase we are not removing the url of the current page
  var value = concrete.getUrlParameterByName(paramName, url);
  var newUrl = '';
  if (url.indexOf('?'+paramName+'='+value) > -1) {
    if (location.search.split('&').length > 1) {
      newUrl = url.replace(paramName+'=', '').replace(value+'&', '');
    } else {
      newUrl = url.replace('?'+paramName+'=', '').replace(value, '');
    }
  } else if (url.indexOf('&'+paramName+'='+value) > -1) {
    newUrl = url.replace('&'+paramName+'=', '').replace(value, '');
  }

  return newUrl;
};

concrete.getUrlParameters = function(locat){
  var search = locat || location.search;
  parameters = {};
  if (search.length) {
    for (var value, i = 0, pairs = search.substr(1).split('&'); i < pairs.length; i++) {
      value = pairs[i].split('=');
      if (value.length > 1) {
        parameters[decodeURIComponent(value[0])] = decodeURIComponent(value[1]);
      }
    }
  }
  return parameters;
};

concrete.pushNewUrl = function(url, method) {
  method = method || 'push';
  if (method == 'push') {
    window.history.pushState({path: url}, '', url);
  } else {
    window.history.replaceState({path: url}, '', url);
  }
};

// Collection template sorting
concrete.getUrlParameterByName = function(parameter) {
  var url = decodeURIComponent(window.location.search.substring(1)),
      urlVariables = url.split('&'),
      parameterName;

  for (i = 0; i < urlVariables.length; i++) {
    parameterName = urlVariables[i].split('=');
    if (parameterName[0] === parameter) {
      return parameterName[1] === undefined ? true : parameterName[1];
    }
  }
};

concrete.handlebarsHelpers = function() {
  Handlebars.registerHelper('compare', function (v1, operator, v2, options) {
    'use strict';
    var operators = {
      '==': v1 == v2 ? true : false,
      '===': v1 === v2 ? true : false,
      '!=': v1 != v2 ? true : false,
      '!==': v1 !== v2 ? true : false,
      '>': v1 > v2 ? true : false,
      '>=': v1 >= v2 ? true : false,
      '<': v1 < v2 ? true : false,
      '<=': v1 <= v2 ? true : false,
      '||': v1 || v2 ? true : false,
      '&&': v1 && v2 ? true : false
    }
    if (operators.hasOwnProperty(operator)) {
      if (operators[operator]) {
        return options.fn(this);
      }
      return options.inverse(this);
    }
    return console.error('Error: Expression "' + operator + '" not found');
  });

  Handlebars.registerHelper('position', function (index, position, options) {
    if (index == position) {
      return options.fn(this);
    }
    return options.inverse(this);
  });

  Handlebars.registerHelper('size', function (object, amount, options) {
    var size = 0;
    for (key in object) {
      if (object.hasOwnProperty(key)) size++;
    }
    if (size > amount) {
      return options.fn(this);
    } else {
      return options.inverse(this);
    }
  });

  Handlebars.registerHelper('split', function(content, split, position, options) {
    var split = content.split(split);
    return split[position];
  });

  Handlebars.registerHelper('replace', function(content, find, replace, options) {
    return (content || '').replace(find, replace);
  });

  Handlebars.registerHelper('money', function (amount, format, options) {
    format = '{{amount}}';
    return new Handlebars.SafeString('<span class=\'money\'>' + concrete.Currency.formatMoney(amount, format) + '</span>');
  });

  Handlebars.registerHelper('math', function (value1, operator, value2, options) {
    'use strict';
    var v1 = Number(value1);
    var v2 = Number(value2);
    var operators = {
      '+': v1 + v2,
      '-': v1 - v2,
      '*': v1 * v2,
      '/': v1 / v2
    }
    if (operators.hasOwnProperty(operator)) {
      return new Handlebars.SafeString(operators[operator]);
    }
    return console.error('Error: Expression "' + operator + '" not found');
  });

  Handlebars.registerHelper('mathMoney', function (amount, operator, amount2, format, options) {
    'use strict';
    format = '{{amount}}';
    var operators = {
      '+': amount + amount2,
      '-': amount - amount2,
      '*': amount * amount2,
      '/': amount / amount2
    }
    if (operators.hasOwnProperty(operator)) {
      return new Handlebars.SafeString('<span class=\'money\'>' + operators[operator] + '</span>');
    }
    return console.error('Error: Expression "' + operator + '" not found');
  });

  Handlebars.registerHelper('handleize', function (string, options) {
    return concrete.handleize(string);
  });

  Handlebars.registerHelper('repeat', function (repetitions, index, min, max, opts) {
    min = min || -999999;
    max = max+1 || 999999;
    index = index || 0;
    var out = "";
    var start = Number(index);
    start = start >= min ? start : min;
    var end = start + repetitions;
    end = end < max ? end : max;
    if (end) {
      for(i = start; i < end; i++) {
        out += opts.fn(i);
      }
    } else {
      out = opts.inverse(this);
    }
    return out;
  });
}

concrete.urlParams = concrete.getUrlParameters();
