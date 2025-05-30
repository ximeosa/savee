document.addEventListener('DOMContentLoaded', function() {
  const websitesList = document.getElementById('websitesList');
  // const youtubeList = document.getElementById('youtubeList'); // Remove this
  const youtubeVideosList = document.getElementById('youtubeVideosList');
  const youtubeChannelsList = document.getElementById('youtubeChannelsList');
  // const selectionsList = document.getElementById('selectionsList'); // Removed
  const webpagesList = document.getElementById('webpagesList'); // New list for 'page' type
  const recycleBinList = document.getElementById('recycleBinList');
  const dragDropToggle = document.getElementById('dragDropToggle');
  let dragDropEnabled = false;
  let draggedItem = null;
  let originalBookmarksOrder = [];

  const sidebarNav = document.getElementById('sidebarNav');
  const allSectionContents = document.querySelectorAll('.section-title[data-section-content], .bookmark-list[data-section-content]');

  let markedForDeletionId = null; // Added global variable

  // Function to update draggable attributes and visual cues (Added)
  function updateDraggableState(enabled) {
    const lists = [websitesList, youtubeVideosList, youtubeChannelsList, webpagesList, recycleBinList];
    lists.forEach(list => {
      if (!list) return; // In case a list element isn't found
      if (enabled) {
        list.classList.add('dnd-enabled');
      } else {
        list.classList.remove('dnd-enabled');
      }
      Array.from(list.children).forEach(item => {
        if (item.classList.contains('bookmark-item')) { // Ensure it's a bookmark item
          item.setAttribute('draggable', enabled ? 'true' : 'false');
        }
      });
    });
  }

  // --- DRAG AND DROP HANDLERS --- (Added)
  function handleDragStart(e) {
    if (!dragDropEnabled || !e.target.classList.contains('bookmark-item')) return;
    draggedItem = e.target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.id); // Store ID
    // Timeout to allow browser to render drag image before style change
    setTimeout(() => {
      if (draggedItem) draggedItem.classList.add('dragging');
    }, 0);
    
    // Store current order of all bookmarks
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      originalBookmarksOrder = data.bookmarks.map(bm => bm.id);
    });
  }

  function handleDragOver(e) {
    if (!dragDropEnabled || !draggedItem) return;
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';

    const targetItem = e.target.closest('.bookmark-item');
    if (targetItem && targetItem !== draggedItem && targetItem.parentElement === draggedItem.parentElement) {
      Array.from(draggedItem.parentElement.children).forEach(child => {
        if (child.classList.contains('bookmark-item')) child.classList.remove('drag-over');
      });
      targetItem.classList.add('drag-over');
    }
  }

  function handleDragLeave(e) {
      const targetItem = e.target.closest('.bookmark-item');
      if (targetItem) {
          targetItem.classList.remove('drag-over');
      }
  }

  function handleDrop(e) {
    if (!dragDropEnabled || !draggedItem) return;
    e.preventDefault();
    const targetItem = e.target.closest('.bookmark-item');
    const droppedOnList = e.target.closest('.bookmark-list');

    if (draggedItem.parentElement) { // Check if draggedItem still has a parent
        Array.from(draggedItem.parentElement.children).forEach(child => {
            if (child.classList.contains('bookmark-item')) child.classList.remove('drag-over');
        });
    }


    if (!targetItem && !droppedOnList) { // Dropped outside a valid target or list
      return;
    }
    
    const draggedItemId = e.dataTransfer.getData('text/plain');
    
    // Ensure drop is within the same list type
    if (targetItem && targetItem.parentElement !== draggedItem.parentElement) {
      console.warn("Cannot move bookmarks between different lists.");
      return; 
    }
    
    if (!targetItem && droppedOnList && droppedOnList === draggedItem.parentElement) {
       const list = draggedItem.parentElement;
       list.appendChild(draggedItem); 
       updateStoredOrder(list);
       return;
    }
    
    if (targetItem && targetItem !== draggedItem) {
      const list = targetItem.parentElement;
      const children = Array.from(list.children).filter(child => child.classList.contains('bookmark-item'));
      const draggedIndex = children.indexOf(draggedItem);
      const targetIndex = children.indexOf(targetItem);

      if (draggedIndex < targetIndex) {
        list.insertBefore(draggedItem, targetItem.nextSibling);
      } else {
        list.insertBefore(draggedItem, targetItem);
      }
      updateStoredOrder(list);
    }
  }

  function handleDragEnd(e) {
    if (!draggedItem) return;
    draggedItem.classList.remove('dragging');
    if (draggedItem.parentElement) { // Check if draggedItem still has a parent
        Array.from(draggedItem.parentElement.children).forEach(child => {
            if (child.classList.contains('bookmark-item')) child.classList.remove('drag-over');
        });
    }
    draggedItem = null;
    originalBookmarksOrder = []; 
  }

  // Function to update chrome.storage.local with new order from a list (Added)
  function updateStoredOrder(listElement) {
    const newOrderedIdsInList = Array.from(listElement.children)
                                .map(item => item.dataset.id)
                                .filter(id => id); 

    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      let allBookmarks = data.bookmarks;
      const bookmarkMap = new Map(allBookmarks.map(bm => [bm.id, bm]));
      let updatedBookmarks = [];
      let usedIds = new Set();

      // Add reordered items from the current list first
      newOrderedIdsInList.forEach(id => {
          if (bookmarkMap.has(id)) {
              updatedBookmarks.push(bookmarkMap.get(id));
              usedIds.add(id);
          }
      });
      
      // Add items from other lists or not in this list, maintaining original overall order as much as possible
      originalBookmarksOrder.forEach(id => {
          if (!usedIds.has(id) && bookmarkMap.has(id)) {
              updatedBookmarks.push(bookmarkMap.get(id));
              usedIds.add(id);
          }
      });

      // Add any truly new bookmarks not captured (should be rare here)
      allBookmarks.forEach(bm => {
          if(!usedIds.has(bm.id)) {
              updatedBookmarks.push(bm);
          }
      });

      chrome.storage.local.set({ bookmarks: updatedBookmarks }, function() {
        if (chrome.runtime.lastError) {
          console.error("Error updating bookmark order:", chrome.runtime.lastError);
        } else {
          console.log("Bookmark order updated successfully.");
        }
      });
    });
  }

  // Function to create a bookmark list item element
  function createBookmarkElement(bookmark, currentSectionId) { // Added currentSectionId
    const item = document.createElement('li');
    item.classList.add('bookmark-item');
    item.setAttribute('data-id', bookmark.id);

    let imageAreaContent = '';
    let displayImageUrl = bookmark.thumbnailUrl || bookmark.faviconUrl;
    let imageSpecificClass = bookmark.thumbnailUrl ? 'bookmark-thumbnail' : (bookmark.faviconUrl ? 'bookmark-favicon' : '');

    if (displayImageUrl) {
      try {
        new URL(displayImageUrl); // Validate URL (basic check)
        imageAreaContent = `
          <div class="bookmark-image-container">
            <img src="${escapeHTML(displayImageUrl)}" alt="${escapeHTML(bookmark.title)}" class="bookmark-image ${imageSpecificClass}">
          </div>`;
      } catch (e) {
        console.warn("Invalid image URL for bookmark:", bookmark.title, displayImageUrl, e);
        imageAreaContent = '<div class="bookmark-image-placeholder"></div>'; // Placeholder for invalid URL
      }
    } else {
      imageAreaContent = '<div class="bookmark-image-placeholder"></div>'; // Placeholder for no image
    }

    let textContent = `
      <div class="bookmark-info">
        <span class="bookmark-title">${escapeHTML(bookmark.title)}</span>
        <a href="${escapeHTML(bookmark.url)}" target="_blank" class="bookmark-url" title="${escapeHTML(bookmark.url)}">${escapeHTML(bookmark.url.length > 60 ? bookmark.url.substring(0,57) + '...' : bookmark.url)}</a>`;

    // Removed selection-specific text block
    
    let dateStringToDisplay = `Added: ${new Date(bookmark.added_date).toLocaleString()}`;
    if (currentSectionId === 'recycle_bin' && bookmark.deleted_timestamp) {
        const deletionDate = new Date(bookmark.deleted_timestamp);
        deletionDate.setDate(deletionDate.getDate() + 7); // Add 7 days
        dateStringToDisplay = `Scheduled for permanent deletion: ${deletionDate.toLocaleDateString()}`;
    } else if (currentSectionId === 'recycle_bin') {
        dateStringToDisplay = 'Marked for deletion (date unavailable)';
    }

    textContent += `
        <small class="bookmark-date">${dateStringToDisplay}</small>
      </div>
    `;

    let actionButtonHTML = `<button class="deleteBtn" data-id="${bookmark.id}" title="Delete bookmark">Delete</button>`;
    if (currentSectionId === 'recycle_bin') {
        actionButtonHTML = `<button class="restoreBtn" data-id="${bookmark.id}" title="Restore bookmark">Restore</button>`;
        // Optionally, add a permanent delete button here:
        // actionButtonHTML += `<button class="permDeleteBtn" data-id="${bookmark.id}" title="Delete Permanently">Delete Permanently</button>`;
    }

    item.innerHTML = `
      ${imageAreaContent}
      ${textContent}
      <div class="bookmark-actions">
        ${actionButtonHTML}
      </div>
    `;
    return item;
  }

// Function to render bookmarks for a specific section
function renderBookmarksForSection(sectionId, allBookmarks) {
  let targetList;
  let filteredBookmarks;

  switch (sectionId) {
    case 'youtube_videos':
      targetList = youtubeVideosList;
      filteredBookmarks = allBookmarks.filter(bm => bm.type === 'youtube_video' && bm.status !== 'deleted');
      break;
    case 'youtube_channels':
      targetList = youtubeChannelsList;
      filteredBookmarks = allBookmarks.filter(bm => bm.type === 'youtube_channel' && bm.status !== 'deleted');
      break;
    case 'websites':
      targetList = websitesList;
      filteredBookmarks = allBookmarks.filter(bm => bm.type === 'website' && bm.status !== 'deleted');
      break;
    case 'webpages': // New case for 'page' type
      targetList = webpagesList;
      filteredBookmarks = allBookmarks.filter(bm => bm.type === 'page' && bm.status !== 'deleted');
      break;
    case 'recycle_bin':
      targetList = recycleBinList;
      filteredBookmarks = allBookmarks.filter(bm => bm.status === 'deleted');
      // Special rendering for recycle bin items might be needed later (e.g., show deletion date, restore button)
      break;
    default:
      console.warn("Unknown section in renderBookmarksForSection:", sectionId);
      return;
  }

  if (!targetList) {
    console.error("Target list not found for section:", sectionId);
    return;
  }

  targetList.innerHTML = ''; // Clear current contents
  if (filteredBookmarks.length === 0) {
    targetList.innerHTML = `<li class="empty-list-placeholder">No bookmarks in this section.</li>`;
  } else {
    filteredBookmarks.forEach(bookmark => {
      const bookmarkElement = createBookmarkElement(bookmark, sectionId); // Pass sectionId
      targetList.appendChild(bookmarkElement);
    });
  }
  // Ensure D&D listeners are updated for the newly rendered list
  updateDraggableState(dragDropEnabled);
  addListEventListenersForList(targetList);
}


function showSection(sectionId) {
  console.log("Switching to section:", sectionId);
  // Update active link in sidebar
  sidebarNav.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.remove('active-section');
    if (link.dataset.section === sectionId) {
      link.classList.add('active-section');
    }
  });

  // Hide all content sections (both h2 and ul)
  allSectionContents.forEach(contentEl => {
    contentEl.classList.remove('active');
    contentEl.style.display = 'none'; // Ensure it's hidden
  });

  // Show the target section (h2 and ul)
  // Note: The querySelector uses `sectionId` directly for the data-section-content attribute.
  const activeTitle = document.querySelector(`.section-title[data-section-content="${sectionId}"]`);
  // The list ID is assumed to be sectionId + "List", e.g., "youtube_videosList", "recycle_binList"
  const activeList = document.getElementById(sectionId + 'List');


  if (activeTitle) {
    activeTitle.classList.add('active');
    activeTitle.style.display = 'block';
  } else if (sectionId === "recycle_bin") {
     const recycleBinTitleFromDOM = document.querySelector('h2[data-section-content="recycle_bin"]');
     if(recycleBinTitleFromDOM) {
        recycleBinTitleFromDOM.classList.add('active');
        recycleBinTitleFromDOM.style.display = 'block';
     } else {
        console.warn("Recycle Bin title H2 element not found with data-section-content='recycle_bin'");
     }
  }


  if (activeList) {
    activeList.classList.add('active');
    activeList.style.display = 'grid'; // Assuming 'grid' is the default display for bookmark lists
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      renderBookmarksForSection(sectionId, data.bookmarks);
    });
  } else {
     console.warn("Could not find list for sectionId:", sectionId + "List");
  }
}

  // Load bookmarks from storage and render them
  function loadAndRenderBookmarks() { // Renamed to reflect it's now initial load
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      const currentActiveLink = sidebarNav.querySelector('.sidebar-link.active-section');
      const defaultSection = currentActiveLink ? currentActiveLink.dataset.section : 'youtube_videos';
      showSection(defaultSection);
    });
  }
  
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>"']/g, function (match) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
    });
  }

function performSoftDelete(bookmarkId) {
  console.log('Performing soft delete for bookmarkId:', bookmarkId);
  chrome.storage.local.get({ bookmarks: [] }, function(data) {
    let bookmarks = data.bookmarks;
    const bookmarkIndex = bookmarks.findIndex(bm => bm.id === bookmarkId);

    if (bookmarkIndex !== -1) {
      bookmarks[bookmarkIndex].status = 'deleted';
      bookmarks[bookmarkIndex].deleted_timestamp = new Date().toISOString();

      chrome.storage.local.set({ bookmarks: bookmarks }, function() {
        if (chrome.runtime.lastError) {
          console.error("Error soft deleting bookmark:", chrome.runtime.lastError);
        } else {
          console.log("Bookmark soft deleted:", bookmarkId);
        }
      });
    } else {
      console.warn("Could not find bookmark to soft delete with ID:", bookmarkId);
    }
  });
}

  function handleDeleteBookmark(event) {
    const clickedDeleteButton = event.target.closest('.deleteBtn'); // Ensure we handle clicks on icons inside button too
    if (clickedDeleteButton) {
      const bookmarkId = clickedDeleteButton.getAttribute('data-id');
      const bookmarkItemElement = clickedDeleteButton.closest('.bookmark-item');

      if (!bookmarkItemElement) return;

      if (markedForDeletionId === bookmarkId) {
        // This is the second click on the same marked item's delete button
        performSoftDelete(bookmarkId);
        bookmarkItemElement.classList.remove('marked-for-deletion');
        markedForDeletionId = null;
        console.log('Confirmed (soft) delete for:', bookmarkId);
      } else {
        // This is a first click, or a click on a different item's delete button
        // Unmark any previously marked item
        if (markedForDeletionId) {
          const previouslyMarkedElement = document.querySelector(`.bookmark-item[data-id="${markedForDeletionId}"]`);
          if (previouslyMarkedElement) {
            previouslyMarkedElement.classList.remove('marked-for-deletion');
          }
        }
        // Mark the new item
        bookmarkItemElement.classList.add('marked-for-deletion');
        markedForDeletionId = bookmarkId;
        console.log('Marked for deletion:', bookmarkId);
      }
      event.stopPropagation(); // Prevent global click listener from immediately unmarking
    }
  }
  
  // Renamed and expanded function (Modified)
  function addListEventListenersForList(list) { // Takes a specific list element
      if (!list) return;
      // Remove existing listeners to prevent duplication if called multiple times
      list.removeEventListener('click', handleDeleteBookmark); 
      list.removeEventListener('click', handleRestoreBookmark);
      // Add new listeners
      list.addEventListener('click', handleDeleteBookmark);
      list.addEventListener('click', handleRestoreBookmark);

      // D&D Listeners (existing code)
      list.removeEventListener('dragstart', handleDragStart);
      list.removeEventListener('dragover', handleDragOver);
      list.removeEventListener('dragleave', handleDragLeave);
      list.removeEventListener('drop', handleDrop);
      list.removeEventListener('dragend', handleDragEnd);
      
      list.addEventListener('dragstart', handleDragStart);
      list.addEventListener('dragover', handleDragOver);
      list.addEventListener('dragleave', handleDragLeave);
      list.addEventListener('drop', handleDrop);
      list.addEventListener('dragend', handleDragEnd);
  }
  // Removed the old loop from addListEventListeners as it's now per list.

  // Drag and Drop Toggle Functionality (Added)
  dragDropToggle.addEventListener('change', function() {
    dragDropEnabled = this.checked;
    updateDraggableState(dragDropEnabled);
    chrome.storage.local.set({ dragDropEnabledSetting: dragDropEnabled });
  });

  // Load D&D enabled state from storage (Added)
  chrome.storage.local.get({ dragDropEnabledSetting: false }, function(data) {
    dragDropEnabled = data.dragDropEnabledSetting;
    dragDropToggle.checked = dragDropEnabled;
    updateDraggableState(dragDropEnabled); 
  });

  // Initial load
  loadAndRenderBookmarks();

function handleRestoreBookmark(event) {
  if (event.target.classList.contains('restoreBtn')) {
    const bookmarkId = event.target.getAttribute('data-id');
    console.log('Restoring bookmarkId:', bookmarkId);

    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      let bookmarks = data.bookmarks;
      const bookmarkIndex = bookmarks.findIndex(bm => bm.id === bookmarkId);

      if (bookmarkIndex !== -1) {
        // Remove status and deleted_timestamp to restore
        delete bookmarks[bookmarkIndex].status;
        delete bookmarks[bookmarkIndex].deleted_timestamp;

        chrome.storage.local.set({ bookmarks: bookmarks }, function() {
          if (chrome.runtime.lastError) {
            console.error("Error restoring bookmark:", chrome.runtime.lastError);
          } else {
            console.log("Bookmark restored:", bookmarkId);
            // View will refresh due to storage.onChanged
          }
        });
      } else {
        console.warn("Could not find bookmark to restore with ID:", bookmarkId);
      }
    });
  }
}

  sidebarNav.addEventListener('click', function(e) {
    e.preventDefault();
    const targetLink = e.target.closest('.sidebar-link');
    if (targetLink && targetLink.dataset.section) {
      showSection(targetLink.dataset.section);
    }
  });

  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes.bookmarks) {
      console.log('Bookmarks changed in storage, reloading current section view.');
      const currentActiveLink = sidebarNav.querySelector('.sidebar-link.active-section');
      const currentSection = currentActiveLink ? currentActiveLink.dataset.section : 'youtube_videos';
      showSection(currentSection); // Re-render the currently active section
    }
  });

  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');
  const importStatus = document.getElementById('importStatus');

  document.addEventListener('click', function(event) {
    if (markedForDeletionId !== null && !event.target.closest('.deleteBtn')) {
      // If an item is marked, and the click was not on any delete button
      // (handleDeleteBookmark would have handled it and stopped propagation if it was on a delete button)
      const markedElement = document.querySelector(`.bookmark-item[data-id="${markedForDeletionId}"]`);
      if (markedElement) {
        markedElement.classList.remove('marked-for-deletion');
        console.log('Unmarked due to click away from delete buttons:', markedForDeletionId);
      }
      markedForDeletionId = null;
    }
  });

  exportBtn.addEventListener('click', function() {
    chrome.storage.local.get({ bookmarks: [] }, function(data) {
      const bookmarksToExport = data.bookmarks;
      if (bookmarksToExport.length === 0) {
        alert('No bookmarks to export.');
        return;
      }

      // Convert bookmarks to JSON string
      const jsonString = JSON.stringify(bookmarksToExport, null, 2); // null, 2 for pretty printing

      // Create a Blob from the JSON string
      const blob = new Blob([jsonString], { type: 'application/json' });

      // Create a URL for the Blob
      const url = URL.createObjectURL(blob);

      // Create a temporary anchor element to trigger the download
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-'); // YYYY-MM-DDTHH-MM-SS
      a.download = `advanced_bookmarker_export_${timestamp}.json`; // Filename for the export
      document.body.appendChild(a); // Append to body to make it clickable
      a.click(); // Programmatically click the anchor to trigger download

      // Clean up: remove anchor and revoke the object URL
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Bookmarks exported successfully.');
      // Optionally, provide user feedback on the options page itself, though alert/download is primary.
    });
  });

  importFile.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) {
      importStatus.textContent = 'No file selected.';
      return;
    }

    if (file.type !== 'application/json') {
      importStatus.textContent = 'Error: Please select a valid JSON file.';
      alert('Error: Please select a valid JSON file (.json).');
      event.target.value = ''; // Reset file input
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedBookmarks = JSON.parse(e.target.result);

        if (!Array.isArray(importedBookmarks)) {
          throw new Error("Imported data is not an array.");
        }

        // Basic validation of imported bookmark structure (first item is enough for a quick check)
        if (importedBookmarks.length > 0) {
          const firstBookmark = importedBookmarks[0];
          if (typeof firstBookmark.title === 'undefined' || 
              typeof firstBookmark.url === 'undefined' ||
              typeof firstBookmark.id === 'undefined' || // ID should ideally be present or regenerated
              typeof firstBookmark.added_date === 'undefined' // Date should be present
              // type is also important
             ) {
            throw new Error("Imported bookmarks have an invalid structure.");
          }
        }
        
        importStatus.textContent = `Found ${importedBookmarks.length} bookmarks to import. Processing...`;

        chrome.storage.local.get({ bookmarks: [] }, function(data) {
          let existingBookmarks = data.bookmarks;
          let newBookmarksCount = 0;
          let skippedDuplicatesCount = 0;
          
          // Create a Set of existing URLs for efficient duplicate checking
          const existingUrls = new Set(existingBookmarks.map(bm => bm.url));

          importedBookmarks.forEach(importedBm => {
            // Ensure imported bookmarks have unique IDs if they clash, or regenerate them
            // For simplicity, we'll assume IDs are unique or regenerate if necessary.
            // A more robust approach would check ID clashes with existing ones.
            // For now, prioritize existing if URL matches.
            if (!existingUrls.has(importedBm.url)) {
              // Ensure essential fields exist, provide defaults if missing and acceptable
              const newBm = {
                id: importedBm.id || 'id_' + new Date().getTime() + Math.random().toString(36).substr(2, 9), // Regenerate ID if missing
                title: importedBm.title || 'Untitled',
                url: importedBm.url,
                type: importedBm.type || 'page',
                added_date: importedBm.added_date || new Date().toISOString(),
                faviconUrl: importedBm.faviconUrl || null,
                thumbnailUrl: importedBm.thumbnailUrl || null,
                text: importedBm.text || null // For selections
              };
              existingBookmarks.unshift(newBm); // Add to beginning
              existingUrls.add(newBm.url); // Add to set to prevent duplicates from within the import file itself
              newBookmarksCount++;
            } else {
              skippedDuplicatesCount++;
            }
          });

          chrome.storage.local.set({ bookmarks: existingBookmarks }, function() {
            if (chrome.runtime.lastError) {
              importStatus.textContent = 'Error saving imported bookmarks.';
              console.error('Error saving imported bookmarks:', chrome.runtime.lastError);
              alert('An error occurred while saving imported bookmarks.');
            } else {
              const message = `Import successful! Added ${newBookmarksCount} new bookmarks. Skipped ${skippedDuplicatesCount} duplicates.`;
              importStatus.textContent = message;
              console.log(message);
              alert(message);
              loadAndRenderBookmarks(); // Refresh the displayed list
            }
            event.target.value = ''; // Reset file input
          });
        });

      } catch (error) {
        importStatus.textContent = `Error: ${error.message}`;
        console.error('Error importing bookmarks:', error);
        alert(`Error importing file: ${error.message}`);
        event.target.value = ''; // Reset file input
      }
    };

    reader.onerror = function() {
      importStatus.textContent = 'Error reading file.';
      alert('An error occurred while reading the file.');
      event.target.value = ''; // Reset file input
    };

    reader.readAsText(file);
  });

  // --- THEME SWITCHER ---
  const themeSelect = document.getElementById('themeSelect');

  function applyTheme(themeName) {
    let effectiveTheme = themeName;
    if (themeName === 'system_default') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark_mode' : 'light_pastel'; // Default to light_pastel if no system preference
    }
    document.body.setAttribute('data-theme', effectiveTheme);
    
    // Update the select dropdown to reflect the actual choice
    // If 'system_default' was chosen, keep it selected, otherwise select the directly chosen theme.
    themeSelect.value = themeName; 

    chrome.storage.local.set({ selectedTheme: themeName }); // Persist the user's *choice*
    console.log("Applied theme:", themeName, "Effective theme:", effectiveTheme);
  }

  themeSelect.addEventListener('change', function() {
    applyTheme(this.value);
  });

  // Load and apply saved theme on startup
  chrome.storage.local.get({ selectedTheme: 'light_pastel' }, function(data) { // Default to light_pastel
    applyTheme(data.selectedTheme);
  });
  
  // Optional: Listen for system theme changes to dynamically update if "System Default" is selected
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      // Only re-apply if 'system_default' is the *selected* option in the dropdown.
      if (themeSelect.value === 'system_default') {
          console.log("System theme changed, re-applying system_default.");
          applyTheme('system_default'); // Re-apply to pick up new system theme
      }
  });
});
