concrete.Collection = (function() {

  function Collection(container) {
    var $container = this.$container = $(container);
    this.selectors = {
      sortBy: '[data-sort]',
      viewBy: '[data-view]'
    }

    $container.on('change', this.selectors.sortBy, this._onSortByChange.bind(this));
    $container.on('click', this.selectors.viewBy, this._onViewByChange.bind(this));
  }

  Collection.prototype = _.assignIn({}, Collection.prototype, {

    _getSortBy: function() {
      return $(this.selectors.sortBy+' option:selected').val();
    },

    _onSortByChange: function() {
      var sortBy = this._getSortBy();
      this.$container.trigger({
        type: 'sortByChange',
        sortBy: sortBy
      });

      concrete.urlParams.sort_by = this.currentSortBy = sortBy;
      // Push the sort method to the browser history and url without reloading the page (used for ajax collections)
      concrete.pushNewUrl(concrete.replaceUrlParameter(window.location.href, 'sort_by', this.currentSortBy), 'replace');
      // Reload the page (used for non-ajax collections)
      // location.search = jQuery.param(concrete.urlParams);
    },

    _onViewByChange: function(evt) {
      evt.preventDefault();
      var viewBy = evt.target.getAttribute('data-view');

      this.$container.trigger({
        type: 'viewByChange',
        sortBy: viewBy
      });

      concrete.urlParams.view = this.currentViewBy = viewBy;
      location.search = jQuery.param(concrete.urlParams);
    },

    onUnload: function() {
      this.$container.off();
    }

  });
  return Collection;
  // intialize self
})();
