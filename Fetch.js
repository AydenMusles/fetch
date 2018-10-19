/*==============================================================================

 ___  _   _    _
/   || | | |  | |
\__  | | | |  | |  __
/    |/  |/_) |/  /  \_/\/
\___/|__/| \_/|__/\__/  /\_/
              |\
              |/

Fetch v1.0.0
Ajax filtering for all your non default filtering sorting and paginatiing needs.

Author: Team Elkfox
https://github.com/Elkfox/Fetch
Copyright (c) 2018 Elkfox Co Pty Ltd
https://elkfox.com
MIT License

==============================================================================*/

var Fetch = function getAllProductsJsonWithAjaxRequestsThenFilterTheJson(configuration) {
  'use strict';
  // Make a new variable from the configuration: https://eslint.org/docs/rules/no-param-reassign
  var options = configuration.options || {};

  // Our default options some of the will be overwritten.
  var defaultOptions = {
    paginationLimit: 150,
    pseudoPagination: 1000,
    minPrice: 0,
    maxPrice: 200,
    resourceUrl: null,
    collectionQuery: '',
    productCount: null,
    paginationMethod: null,
    disableClass: 'no-pointer',
    filterOutOfStock: false,
  };

  // Make a new variable from the configuration: https://eslint.org/docs/rules/no-param-reassign
  var selectors = configuration.selectors || {};

  // Our default selectors, if required these can be reassigned from the initialization script.
  var defaultSelectors = {
    collectionTemplate: '[data-collection-template]',
    collectionContainer: '[data-collection-container]',
    filterContainer: '[data-filter-container]',
    page: '[data-page]',
    filter: '[data-filter]',
    exclusiveFilter: '[data-exclusive-filter]',
    filterValue: '[data-filter-value]',
    clearFilters: '[data-clear-filters]',
    paginationTemplate: '[data-pagination-template]',
    paginationContainer: '[data-pagination-container]',
  };

  // Make a new variable from the configuration: https://eslint.org/docs/rules/no-param-reassign
  var filters = configuration.filters || {};

  // Currently there are no default filters setup but they can be added here if required.
  var defaultFilters = {};

  // Merge the configuration into the defaults.
  this.options = Object.assign(defaultOptions, options);
  this.filters = Object.assign(defaultFilters, filters);
  this.selectors = Object.assign(defaultSelectors, selectors);

  // Loop through the filters and create an object to help us keep track of which filters have been
  // applied and add additional setting the the filter.
  for (var filter in this.filters) {
    if (this.filters.hasOwnProperty(filter)) {
      // Create an empty array that will store the values of the currently applied filters.
      this.filters[filter].filters = [];
      // If we have defined in the initializer that this filter should filter sold out options it
      // will be set true otherwise it default to true.
      this.filters[filter].filterOutOfStock = this.filters[filter].filterOutOfStock || this.options.filterOutOfStock;
      this.filters[filter].filterNoOption = this.filters[filter].filterNoOption || true;
    }
  }

  // Create a deep clone of the default filters so that when the filters are cleared we can easily
  // change back to the initial state.
  this.emptyFilters = this.deepClone(this.filters);

  // Define the default sortby method.
  this.sorting = concrete.urlParams.sort_by || configuration.defaultSorting || 'default';

  // Build the pagination object. This is use to build the handlebars pagination and also to split
  // the returned products into individual pages.
  /*
    current: The current page that we are on.
    total: The total number of pages, total number of products/ products by page rounded up.
    currentTotal: The number of products that have returned from the ajax requests
    limit: The number of products per page
  */
  this.pagination = {
    current: Number(concrete.urlParams.p) || 1,
    total: Math.ceil(this.options.productCount/this.options.pseudoPagination),
    currentTotal: Math.ceil(this.options.productCount/this.options.pseudoPagination),
    limit: this.options.pseudoPagination
  };

  this.allProducts = []; // The whole collection, may have come from local storage.
  this.gettingProducts = []; // An array of every product returned
  this.filteredProducts = []; // An array of every product returned with the current filters applies

  // Instead of wasting an ajax request on getting the first 50 products in a collection we can
  // provide first 50 products in the initializer.
  if (configuration.hasOwnProperty('firstPage')) {
    // Specifiy that we are using the first 50 for use in the protoype
    this.firstPage = true;
    this.firstPageProducts = this.deepClone(configuration.firstPage);
  }

  // Create a new ajax queue for getting all of the products from the json endpoint
  this.queue = new Queue({
    success: function success(success) {
      jQuery(document).trigger('filtering:pageRecieved');
    }
  });
  // Create event listeners.
  this.buildEventListeners();
  // If there are any url parameters that relate to filters apply them.
  this.addUrlFilters();
  // Render the pagination.
  this.createPagination(this.pagination);
  // Generate a list of urls of links to json endpoint and add them to the ajax queue.
  this.getCollectionJson();
};

/*
  Listen for any:
    Clicks on filters
    Clicks on  exclusive filters
    Clicks on clear filters button
    Change of sorting method
    Click on pagination links
*/
Fetch.prototype.buildEventListeners = function buildEventListeners() {
  // Listen for click on a filter element
  jQuery(document).on('click', this.selectors.filter, this.toggleFilter.bind(this));
  // Listen for click on an exclusive filter element
  jQuery(document).on('click', this.selectors.exclusiveFilter, this.toggleExclusiveFilter.bind(this));
  // Listen for click on clear filters
  jQuery(document).on('click', this.selectors.clearFilters, this.clearFilters.bind(this));
  // Listen for the change of sorting method
  jQuery(document).on('sortByChange', this.toggleSorting.bind(this));
  // Could change the method here to use endless scrolling if required.
  if (this.options.paginationMethod) {
    if (this.options.paginationMethod == 'paginate') {
      jQuery(document).on('click', this.selectors.page, this.toggleChangePage.bind(this));
    }
  }
};

/*
  Find out which page has been click from the data attribut of the clicked link and change the page to that number.
*/
Fetch.prototype.toggleChangePage = function getTheDesiredPageFromTheDataAttributeThenChangePage(event) {
  // Which page has been clicked
  var page = jQuery(event.currentTarget).data(this.selectors.page.replace('[data-', '').replace(']', ''));
  this.changePage(page);
};

/*
  A page change has been toggled so create the new context to update the dom and render the relevant products
*/
Fetch.prototype.changePage = function pushAPageParameterRenderTheMarkUpWithANewPageAndUpdateThePaginationContext(page) {
  /*
    If the user is on page 10 and they apply a new filter we can assume that there will be less pages. Therefore we take them back to page 1 when a filter is applied. Because the page isn't reloaded users can click filters while this is happening. Because the page is scrolling it's easy to click the incorrect filter when this happend so we disable clicking of the filter untill the scrolling to the top has finished.
  */
  this.disableFilters();
  // Update the url with the relevant p parameter
  concrete.pushNewUrl(concrete.addUrlParameter(window.location.href, 'p', page), 'replace');
  // Scroll to top of the collection
  var collectionContainer = document.querySelectorAll(this.selectors.collectionContainer);
  collectionContainer[0].scrollIntoView(true);
  // Make the filters clickable again. They were disabled before scrolling.
  this.enableFilters();
  // Render the new pagination to reflect the change
  this.pagination.current = page;
  this.createPagination(this.pagination);
  // Render the new product to reflect the changes
  this.paginate(this.filteredProducts);
};

/*
  Using the pagination object render a handlebars template of the pagination and append it to the pagination container element.
*/
Fetch.prototype.createPagination = function renderHandlebarsTemplateOfThePagination(pagination) {
  var context = pagination;
  var source = jQuery(this.selectors.paginationTemplate).html();
  var template = Handlebars.compile(source);
  var html = template(context);
  jQuery(this.selectors.paginationContainer).html(html);
};

/*
  Using the context of the filtered, sorted and paginated products
*/
Fetch.prototype.buildCollection = function useTheFirstPageOfTheContextToRenderTheProductsWithHandlebars(context) {
  var products = context;
  // Render the template using handlebars
  var source = jQuery(this.selectors.collectionTemplate).html();
  var template = Handlebars.compile(source);
  var html = template(products);
  jQuery(this.selectors.collectionContainer).html(html);
  jQuery(document).trigger('filtering:handlebarsRendered', [this.selectors]);
};

/*
  On page load if the url has any filter parameters in it we apply those filters by checking on the relvent checkboxes.
*/
Fetch.prototype.addUrlFilters = function applyFiltersBasedOnUrlParameters() {
  // Loop through each of our predefined filters
  for (var key in this.filters) {
    if (this.filters.hasOwnProperty(key)) {
      // check to see if a url
      if (concrete.urlParams[key] != undefined) {
        this.filters[key].filters = concrete.urlParams[key].split(',');
        if (typeof(this.filters[key].filters) == 'object') {
          for (var i = 0; i < this.filters[key].filters.length; i++) {
            var $filter = jQuery('[data-filter="'+key+'"][data-filter-value="'+this.filters[key].filters[i]+'"]');
            var $exclusiveFilter = jQuery('[data-exclusive-filter="'+key+'"][data-filter-value="'+this.filters[key].filters[i]+'"]');
            if ($filter.attr('type') == 'checkbox') {
              $filter.prop('checked', true);
            } else {
              $filter.addClass('active');
            }
            if ($exclusiveFilter.attr('type') == 'checkbox') {
              $exclusiveFilter.prop('checked', true);
            } else {
              $exclusiveFilter.addClass('active');
            }
          }
        }
      }
    }
  }
};

/*
  Create a list of request to json endpoints of products
  Add the requests to the ajax queue
*/
Fetch.prototype.getCollectionJson = function queueAnAjaxRequestForEachOfTheCollectionsPagesAndBuildJsonContext(handle) {
  // Calculate the number of pages, this is the actual number of pages that we need to request as
  // opposed to the pseudo pagination of how mnay products we want to display per page.
  this.pageCount = Math.ceil(this.options.productCount/this.options.paginationLimit);

  // Loop through each of the pages and build the request
  for (var i = 0; i < this.pageCount; i++) {
    // The page number is 1 indexed so add one to i.
    var pageNumber = i + 1;
    // Create an empty request object to add all od our parameters to.
    var request = {};

    // Create the request url. We use the handle url parameter so that we can access the value in liquid and define the number of products to return per request. I have found that depending on the size of the returned json that the sweet spot of products per request varies. Try starting at 250 and increasing it for smaller json object and decreasing for larger json objects. You can also add asort method to this url if you want the products to come back in a specific order. be careful that you don't have any overlapping with the first 50 products though.
    request.url = this.options.resourceUrl +'?view=json&handle='+this.options.paginationLimit + '&page='+ pageNumber+this.options.collectionQuery + '&sort=' + this.sorting;

    // Get the first page of products offset by the first 50 that we have already collected.
    // We pass the offset to the endpoint using the order parameter
    if (this.firstPage && pageNumber == 1 && !this.defaultSortBy) {
      request.url = this.options.resourceUrl + '?view=json&handle=' + this.options.paginationLimit + '&page=' + pageNumber + this.options.collectionQuery + '&sort=' + this.sorting;

      // Store the returned products in getting products so that we can update the cache if required without interfering with all products.
      this.gettingProducts = this.gettingProducts.concat(this.firstPageProducts);

      // If we have already retrieved the whole collection from the localStorage then
      // do not apply filters or update all products
      this.allProducts = this.deepClone(this.gettingProducts);
      this.applyFilters(this.deepClone(this.allProducts), this.filters, this.sorting, false);
    }

    // If this is the last page
    if (pageNumber === this.pageCount) {
      /*
        The last page request success is different to the others
        On the last page we need to update the localStorage
      */
      request.success = function success(response) {
        response = JSON.parse(response.replace(/<(?:.|\n)*?>/gm, ''));
        products = response.products;

        this.gettingProducts = this.gettingProducts.concat(products);
        this.newProducts = this.deepClone(this.gettingProducts);

        // If we are not building the collection from the cache then we can update all products and filter the products that return from the last request.
        this.allProducts = this.deepClone(this.gettingProducts);
        this.applyFilters(this.deepClone(this.allProducts), this.filters, this.sorting, false);
      }.bind(this);

    } else {
      // Any page that is not the last this is the success function for when the products are returned from the endpoint.
      request.success = function success(response) {
        // Parse the response into json
        response = JSON.parse(response.replace(/<(?:.|\n)*?>/gm, ''));
        products = response.products;

        // Append the return products to the array of products being returned.
        this.gettingProducts = this.gettingProducts.concat(products);

        // If we are not building the collection from the cache then we can update all products and filter the products that return from the last request.
        this.allProducts = this.deepClone(this.gettingProducts);
        this.applyFilters(this.deepClone(this.allProducts), this.filters, this.sorting, false);
      }.bind(this);

    }

    if (this.defaultSortBy) {
      request.url += '&sort_by=' + this.defaultSortBy;
    }
    // Add the request to the ajax queue.
    this.queue.add(request);
  }
};

/*
  When the clear filters button is clicked remove all of the applied filters and rerender the products.
*/
Fetch.prototype.clearFilters = function clearFiltersFromTheObjectAndTheUrlThenUpdateDOM(event) {
  event.preventDefault();
  // This the filters to the initial state before any filters were applied.
  this.filters = this.deepClone(this.emptyFilters);

  // Uncheck any checkboxes
  jQuery(this.selectors.exclusiveFilter).removeClass('active').prop('checked', false);
  jQuery(this.selectors.filter).removeClass('active').prop('checked', false);

  // re render the products with no filters applied.
  this.applyFilters(this.deepClone(this.allProducts), this.filters, this.sorting);
};

/*
  Fires when a filter is clicked on.
*/
Fetch.prototype.toggleFilter = function afterAFilterElementHasBeenClickedToggleTheFilter(event) {
  // Go back to the first page.
  this.changePage(1);

  // Don't prevent default for checkboxes or radio buttons
  var $element = jQuery(event.currentTarget);
  var filterType = $element.data(this.selectors.filter.replace('[data-', '').replace(']', ''));
  var filterValue = $element.data(this.selectors.filterValue.replace('[data-', '').replace(']', ''));
  var filterIndex = this.filters[filterType].filters.indexOf(filterValue);
  var type = $element.attr('type');

  // Visually change the appearance of the toggled filter and modify the filter object.
  if (type == 'checkbox') {
    if (filterIndex !== -1) {
      // Filter already applied so remove it
      $element.prop('checked', false);
      this.filters[filterType].filters.splice(filterIndex, 1);
    } else {
      $element.prop('checked', true);
      this.filters[filterType].filters.push(filterValue);
    }
  } else {
    if (filterIndex !== -1) {
      // Filter already applied so remove it
      $element.removeClass('active');
      this.filters[filterType].filters.splice(filterIndex, 1);
    } else {
      $element.addClass('active');
      this.filters[filterType].filters.push(filterValue);
    }
  }

  // Trigger jquery event that the filters have changed for other modules to use.
  jQuery(document).trigger('filtering:filtersChanged', [this.filters]);
  // Refilter and render the products with  the new filter applied.
  this.applyFilters(this.deepClone(this.allProducts), this.filters, this.sorting);
};

/*
  The same as the normal filter but behave like a radio button regardless of the element that is used.
*/
Fetch.prototype.toggleExclusiveFilter = function afterAFilterElementHasBeenClickedTurnOnTheFilterAndTurnOffSiblingFilters(event) {
  // Change the page to 1
  this.changePage(1);

  // Don't prevent default for checkboxes or radio buttons
  var $element = jQuery(event.currentTarget);
  var filterType = jQuery(event.currentTarget).data(this.selectors.exclusiveFilter.replace('[data-', '').replace(']', ''));
  var filterValue = jQuery(event.currentTarget).data(this.selectors.filterValue.replace('[data-', '').replace(']', ''));
  var filterIndex = this.filters[filterType].filters.indexOf(filterValue);
  var type = jQuery(event.currentTarget).attr('type');

  if (type == 'checkbox') {
    if (filterIndex !== -1) {
      $(this.selectors.exclusiveFilter.replace(']', '='+ filterType +']')).prop('checked', false);
      this.filters[filterType].filters = [];
    } else {
      // unapply all filters
      $(this.selectors.exclusiveFilter.replace(']', '='+ filterType +']')).prop('checked', false);
      this.filters[filterType].filters = [];
      $element.prop('checked', true);
      this.filters[filterType].filters.push(filterValue);
    }
  } else {
    if (filterIndex !== -1) {
      $(this.selectors.exclusiveFilter.replace(']', '='+ filterType +']')).removeClass('active');
      this.filters[filterType].filters = [];
    } else {
      // unapply all filters
      $(this.selectors.exclusiveFilter.replace(']', '='+ filterType +']')).removeClass('active');
      this.filters[filterType].filters = [];
      $element.addClass('active');
      this.filters[filterType].filters.push(filterValue)
    }
  }
  jQuery(document).trigger('filtering:filtersChanged', [this.filters]);

  this.applyFilters(this.deepClone(this.allProducts), this.filters, this.sorting);
};

/*
  Fired when the sorting method has changed by default this uses the Concrete jquery event sortByChange
*/
Fetch.prototype.toggleSorting = function afterSortingHasBeChangedReOrderTheSorting(event) {
  this.sorting = event.sortBy;
  jQuery(document).trigger('filtering:sortingChanged', [this.filters]);
  this.applyFilters(this.deepClone(this.allProducts), this.filters, this.sorting);
};

/*
  Apply filters is a very important function as the filter flow starts here.

|  Apply filters >                      Apply Sorting >                        Paginate
|  -------------------------------------------------------------------------------------------------
|  Remove an irrelevant products from | Sort the filtered products into the | Splice the sorted and
|  the product list based on the      | correct order based on the current  | filtered products into
|  currently applied filters.         | sort method.                        | the pseudo pagination
|  Update the url parameters to       | We do this after the products have  | amount offset by the
|  reflect the currently applied      | been filtered so that we are not    | current page.
|  filters, page and sorting method   | sorting irrelevant products.        |

*/
Fetch.prototype.applyFilters = function applyCurrentFilters(allProducts, allFilters, currentSorting, updateUrl) {
  var products = allProducts; // All of the products that we are filtering
  var filters = allFilters; // All of the filters that we are filtering by
  var sorting = currentSorting; // The sorting method that we will use to orer the products
  updateUrl = updateUrl || true; // In somecase we will not want to update the url, this can be passed as an addtional parameted.

  // Pass the products through the currently applied filters.
  this.filteredProducts = this.getFilteredProducts(products, filters);
  // Keep track of the number of products that we will be rendering.
  this.pagination.filteredTotal = Math.ceil(this.filteredProducts.length/this.options.pseudoPagination);

  // Update the url parameters to reflect the currently applied filters, page and sorting method
  var urlParams = this.createFilterUrl(filters)+this.createSortingUrl(sorting)+this.createPaginationUrl(this.pagination.current);

  // Switch the first & for a ?
  if (urlParams.length > 0) {
    urlParams = urlParams.replace(/^./, '?');
  }
  // if there is only an ? the url parameters should be empty.
  if (urlParams.length == 1) {
    urlParams = '';
  }

  // If there are parameters update the url.
  if (urlParams.length && updateUrl) {
    concrete.pushNewUrl(window.location.href.split('?')[0]+urlParams, 'replace');
  }

  // Sort the filtered products.
  this.applySorting(this.filteredProducts);
};

/*
  Part two of the filter flow.
  Pass the sorting products through the currently applied sort method.
*/
Fetch.prototype.applySorting = function applyCurrentSortingToFilteredProducts(filteredProducts) {
  var products = filteredProducts;
  var sorting = this.sorting;
  // Pass the sorting products through the currently applied sort method.
  this.sortedProducts = this.getSortedProducts(products, sorting);
  // paginate the sorted products.
  this.paginate(this.sortedProducts)
};

/*
  Part three of the filter flow.
  Splice the products into the correct page and then render the products and pagination.
*/
Fetch.prototype.paginate = function spliceFilteredAndSortedProductsIntoPages(filteredSortedProducts) {
  var pagination = this.pagination;
  // The index of the last product that we want to display
  var pagePaginateMax = pagination.current * pagination.limit;
  // The index of the first product that we want to display
  var pagePaginateMin = pagePaginateMax - pagination.limit;

  // Check that we have set a limit. It's definitely a good idea too on large collections because the rendering can be really heavy on the browser.
  if (pagination.limit > 0) {
    // Splice the products at the min and the max.
    this.paginatedProducts = filteredSortedProducts.slice(pagePaginateMin, pagePaginateMax);
  } else {
    this.paginatedProducts = filteredSortedProducts;
  }

  // Create a blank context for handlebars to render.
  var context = {};
  // Add the filtered sorted and paginated products to the context
  context.products = this.paginatedProducts;

  // Add additional context
  // By default define loading completed as false, this way we can display a message to the user so that they know there current filter pattern may display otpions once all the products are returned.
  context.loadingCompleted = false;
  // Add the total number of products so that we can tell the user how many products they are waiting for.
  context.productsCount = this.options.productCount;
  // Add the number of products that have come back from the reequests.
  context.productsReturned = this.allProducts.length;
  // if the number of products that have come back matches the total number then the loading is completed.
  if (context.productsReturned == context.productsCount) {
    context.loadingCompleted = true;
    // Now we have all the products returned we can recalculate the total number of pages
    this.pagination.currentTotal = this.pagination.filteredTotal;
    // Now we have adjusted the total number of pages to match that of the current
    // Filtering we might be on a page that is empty.
    // So we change the current page to the highest.
    if (this.pagination.current > this.pagination.currentTotal && this.pagination.currentTotal > 1) {
      return this.changePage(this.pagination.currentTotal);
    }
  } else {
    this.pagination.currentTotal = this.pagination.total;
  };
  // Render the markup of the products using handlebars
  this.buildCollection(context);
  // Render the pagination using handlebars
  this.createPagination(this.pagination);
};

/*
  Loop through each of the filters and apply them to the supplied products.
*/
Fetch.prototype.getFilteredProducts = function passAllTheProductsThroughTheCurrentFiltersAndReturnAnArrayOfFilteredProducts(products, filters) {
  var filteredProducts = products;
  for (var filter in filters) {
    if (filters.hasOwnProperty(filter)) {
      if (filters[filter].hasOwnProperty('filters')) {
        filteredProducts = this.filterBy(filteredProducts, filters[filter]);
      }
    }
  }
  return filteredProducts;
};

/*
  Sort the products into the correct order.
*/
Fetch.prototype.getSortedProducts = function sortTheCurrentlyFilteredProductsAndReturnAnArraySortedByTheCurrentMethod(products, sorting) {
  var sortedProducts = products;

  // A list of sort methods, where the current sort method needs to match the key.
  // The a and b parameters are two seperate products that are being compared so they have access
  // to all of the keys that exist in the json endpoint.
  var sortMatrix = {
    'created-descending': function(a, b) {
      // newest to Oldest
      return new Date(b.created_at) - new Date(a.created_at);
    },
    'created-ascending': function(a, b) {
      // Oldest to newest
      return new Date(a.created_at) - new Date(b.created_at);
    },
    'price-descending': function(a, b) {
      // Highest to lowest
      return b.price - a.price;
    },
    'price-ascending': function(a, b) {
      // lowest to heighest
      return a.price - b.price;
    },
    'title-ascending': function(a, b){
      return a.title.localeCompare(b.title);
    },
    'title-descending': function(a, b){
      return b.title.localeCompare(a.title);
    }
  }


  // If the current sortmethod does not exist in the matrix above then no sorting will tkae place.
  if (sortMatrix.hasOwnProperty(sorting)) {
    /*
      Use the javascript sort function with the current sort method to organise the products into the right order.
    */
    sortedProducts.sort(sortMatrix[sorting]);
  }

  return sortedProducts;
};

/*
  This is where the magic happens.
  Loop through products and variants removing any that are irrelevant.
*/
Fetch.prototype.filterBy = function returnProductsWhenFilteredByTheParameterPassed(filteredProducts, filter) {
  var products = filteredProducts;
  var type = filter.type;
  var filters = filter.filters;
  var element = filter.element;

  /*
    Each of the below filter functions are basically the same, they use the javascript filter function and loops through each of the products in the current set, if the comparison resolves as true then the product will not be filtered if it is false it will be..
  */

  if (typeof(products) !== 'undefined') {
    // Check that the current filter group has a filter applied
    if (filters.length) {
      // Filter by variant
      if (type == 'variant') {
        products = products.filter(function(product) {
          var optionPosition = false;
          product.opts.forEach(function(option, index) {
            if (option.n == filter.name) {
              optionPosition = 'opt' + option.pos;
            }
          });

          // First filter out of stock variants
          if (filter.filterOutOfStock) {
            product.variants = product.variants.filter(function(variant) {
              return variant.av;
            });
          }

          // If the option exists for this product filter matching variants
          if (optionPosition != false) {
            product.variants = product.variants.filter(function(variant) {
              if (filters.indexOf(variant[optionPosition]) !== -1) {
                return true;
              }
            });
          } else {
            if (filter.filterNoOption) {
              return false;
            }
          }

          return product.variants.length > 0 ? true : false;
        });
      // Filter by vendor
      } else if (type == 'vendor') {
        products = products.filter(function(product) {
          var match = false;

          filter.filters.forEach(function(vendor) {
            if (product.vendor == vendor) {
              if (filter.filterOutOfStock) {
                match = product.available;
              } else {
                match = true;
              }
            }
          });

          return match;
        });
        return products;
      // Filter by product type
      } else if (type == 'type') {
        products = products.filter(function(product) {
          var match = false;

          // Loop through each of the selected product type and see if it matches the current product if true then it won't be filtered
          filter.filters.forEach(function(type) {
            if (product.product_type == type) {
              if (filter.filterOutOfStock) {
                match = product.available;
              } else {
                match = true;
              }
            }
          });

          return match;
        });
        return products;
      // Filter by product tag
      } else if (type == 'tag') {
        products = products.filter(function(product) {
          var match = false;

          // Loop through each of the selected product tags and see if it matches the current product if true then it won't be filtered
          filter.filters.forEach(function(tag) {
            if (product.tags.indexOf(tag) !== -1) {
              // Filter out of stock variants
              if (filter.filterOutOfStock) {
                match = product.available;
              } else {
                match = true;
              }
            }
          });

          return match;
        });
        return products;
      // Filter by product price
      } else if (type == 'price') {
        products = products.filter(function(product) {
          product.variants = product.variants.filter(function(variant) {
            var price = parseInt(variant.price);
            for (var i = 0; i < filter.filters.length; i++) {
              var rangeString = filter.filters[i]
              var rangeMin;
              var rangeMax;
              if (rangeString.indexOf('+') > -1) {
                rangeMin = Number(rangeString.replace('+', ''));
                rangeMax = 9999999999;
              } else {
                var rangeArray = rangeString.split('-');
                rangeMin = Number(rangeArray[0]);
                rangeMax = Number(rangeArray[1]);
              }
              if ((price >= (rangeMin)) && ((price <= (rangeMax)))) {
                return true;
              }
            }
          });

          if (product.variants.length > 0) {
            // Filter out of stock variants
            if (filter.filterOutOfStock) {
              return product.available;
            } else {
              return true;
            }
          }
        });
      // Filter by sale
      } else if (type == 'sale') {
        if (filter.filters[0] == true || filter.filters[0] == 'true') {
          products = products.filter(function(product) {
            if (product.on_sale) {
              // Filter out of stock variants
              if (filter.filterOutOfStock) {
                return product.available;
              } else {
                return true;
              }
            }
          });
        }
      }
    } // end of if filter.length
  }
  return products;
};

// Create the url parameters for the currently applied filters.
Fetch.prototype.createFilterUrl = function turnTheCurrentlyAppliedFiltersIntoAUrl(allFilters) {
  var filterString = '';
  var filters = allFilters;
  // For each filter group that has filters applied create a URI endcoded comma seperated list of the values.
  for (var filter in filters) {
    if (filters.hasOwnProperty(filter)) {
      if (filters[filter].hasOwnProperty('filters')) {
        if (filters[filter].filters.length > 0) {
          filterString += '&'+filter+'='+encodeURIComponent(filters[filter].filters.join(','));
        }
      }
    }
  }
  return filterString;
};

// Create the url parameter for the current sorting method.
Fetch.prototype.createSortingUrl = function turnTheCurrentlyAppliedSortingIntoAUrlParam(sorting) {
  var sortingString = '';
  if (typeof(sorting) == 'undefined') {
    return sortingString;
  }
  if (sorting != 'default') {
    sortingString = '&sort_by=' + sorting;
  }
  return sortingString;
};

// Create the url parameter for the current page.
Fetch.prototype.createPaginationUrl = function turnTheCurrentlyAppliedPageIntoAUrlParam(page) {
  var pageString = '&p='+page;
  return pageString;
};

// Create a new object that will not mutate the original
Fetch.prototype.deepClone = function returnACloneOfThePassedObjectThatWillNotMutateTheOriginal(object) {
  return JSON.parse(JSON.stringify(object));
};

// Stop the filters from being clickable
Fetch.prototype.disableFilters = function applyANoClickClassToTheFilterContainer() {
  $(this.selectors.filterContainer).addClass(this.options.disableClass);
};
// Allow the filters to be clickable
Fetch.prototype.enableFilters = function removeNoClickClassFromTheFilterContainer() {
  $(this.selectors.filterContainer).removeClass(this.options.disableClass);
};
