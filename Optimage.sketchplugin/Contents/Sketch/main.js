var bundleID = "com.vmdanilov.optimage";

function showStatusMessage(msg) {
    try {
        NSApplication.sharedApplication().orderedDocuments().firstObject().showMessage(msg);
    } catch (e) {}
}

function isEnabled() {
    var defaults = NSUserDefaults.alloc().initWithSuiteName(bundleID);
    return defaults.objectForKey("sketch.autoCompression") != null ? defaults.boolForKey("sketch.autoCompression") : true;
}

function toggleAutoCompression() {
    var defaults = NSUserDefaults.alloc().initWithSuiteName(bundleID);
    var enabled = !isEnabled();
    defaults.setBool_forKey(enabled, "sketch.autoCompression");
    showStatusMessage(enabled ? "Enabled Auto Compression" : "Disabled Auto Compression");
}

function compress(context, files, hidden) {
    if (!files.length) return;

    var workspace = NSWorkspace.sharedWorkspace();
    var appURL = workspace.URLForApplicationWithBundleIdentifier(bundleID);
    if (!appURL) {
        showStatusMessage("Optimage is not installed");
        workspace.openURL(NSURL.URLWithString("http://getoptimage.com"));
        return;
    }

    var documentTypes = NSBundle.bundleWithURL(appURL).infoDictionary().objectForKey("CFBundleDocumentTypes");
    var validFileExtensions = NSMutableArray.array();
    for (var i = 0; i < documentTypes.length; i++) {
        var extensions = documentTypes[i].valueForKey("CFBundleTypeExtensions");
        if (extensions) validFileExtensions.addObjectsFromArray(extensions);
    }

    files = files.filteredArrayUsingPredicate(NSPredicate.predicateWithFormat("pathExtension IN %@", validFileExtensions));
    if (!files.length) return;

    var flags = NSWorkspaceLaunchWithoutAddingToRecents | NSWorkspaceLaunchAsync;
    if (hidden) {
        flags |= NSWorkspaceLaunchWithoutActivation | NSWorkspaceLaunchAndHide;
    }

    workspace.openURLs_withAppBundleIdentifier_options_additionalEventParamDescriptor_launchIdentifiers_(files, bundleID, flags, null, null);
}

function getFileURLs(assets) {
    var fileURLs = NSMutableArray.array();
    for (var i = 0; i < assets.count(); i++) {
        var asset = assets.objectAtIndex(i);
        if (NSFileManager.defaultManager().fileExistsAtPath(asset.path)) {
            fileURLs.addObject(NSURL.fileURLWithPath(asset.path));
            // fileURLs.push(NSURL.fileURLWithPath(asset.path));
        }
    }
    return fileURLs;
}

function getExportPath(path) {
    var dialog = NSOpenPanel.openPanel();
    dialog.setTitle("Export");
    dialog.setCanChooseFiles(false);
    dialog.setCanChooseDirectories(true);
    dialog.allowsMultipleSelection = false;
    dialog.setCanCreateDirectories(true);
    dialog.setPrompt("Export");
    if (path) dialog.setDirectoryURL(path);
    var result = dialog.runModal();
    if (result == NSOKButton) {
        return dialog.URLs().firstObject().path();
    }
    return null;
}

function run(context) {
    var exportables = context.document.allExportableLayers();
    if (!exportables.count()) {
        showStatusMessage("No exportable layers");
        return;
    }
    var selectedLayers = context.selection;
    if (selectedLayers.count()) {
        var selectedExportables = NSMutableSet.setWithArray(exportables);
        selectedExportables.intersectSet(NSSet.setWithArray(selectedLayers));
        if (selectedExportables.count()) exportables = selectedExportables.allObjects();
    }
    var exportPath = getExportPath();
    if (!exportPath) return;
    showStatusMessage("Exporting assets…");
    // prepare
    var assets = NSMutableArray.alloc().init();
    for (var i = 0; i < exportables.count(); i++) {
        var layer = exportables.objectAtIndex(i);
        var requests = MSExportRequest.exportRequestsFromExportableLayer(layer);
        if (!requests.count()) continue;
        for (var j = 0; j < requests.count(); j++) {
            var request = requests.objectAtIndex(j);
            var path = NSString.pathWithComponents([exportPath, request.name() + '.' + request.format()]);
            assets.addObject({
                request: request,
                path: path
            });
        }
    }
    // export
    for (var i = 0; i < assets.count(); i++) {
        var asset = assets.objectAtIndex(i);
        var render;
        if (asset.request.format() == "svg") {
            render = MSExportRendererWithSVGSupport.exporterForRequest_colorSpace(asset.request, NSColorSpace.sRGBColorSpace());
        } else {
            render = MSExporter.exporterForRequest_colorSpace(asset.request, NSColorSpace.sRGBColorSpace());
        }
        render.data().writeToFile_atomically(asset.path, true);
    }
    // compress asynchronously
    var fileURLs = getFileURLs(assets);
    if (fileURLs.count()) compress(context, fileURLs, false);
}

function runAuto(context) {
    if (!isEnabled()) return;
    var fileURLs = getFileURLs(context.actionContext.exports);
    compress(context, fileURLs, true);
}
