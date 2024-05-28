## Import Modules

```javascript
require([
  "esri/Graphic",
  "esri/Map",

  "esri/core/Collection",
  "esri/core/reactiveUtils",

  "esri/form/FormTemplate",
  "esri/form/elements/FieldElement",
  "esri/form/elements/inputs/TextAreaInput",

  "esri/layers/FeatureLayer",
  "esri/layers/GraphicsLayer",
  "esri/views/MapView",

  "esri/widgets/FeatureForm",
  "esri/widgets/FeatureTable",
  "esri/widgets/Sketch/SketchViewModel",
], function (
  Graphic,
  Map,

  Collection,
  reactiveUtils,

  FormTemplate,
  FieldElement,
  TextAreaInput,

  FeatureLayer,
  GraphicsLayer,
  MapView,

  FeatureForm,
  FeatureTable,
  SketchViewModel
) {

  // App code goes here.
  
});
```

## Set up layer and view

```javascript
const layer = new FeatureLayer({
  title: "Boston Streetlamps",
  url: "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/Boston_Street_Light_Locations/FeatureServer/0"
});

// Used for selection graphic
const graphicsLayer = new GraphicsLayer();

const map = new Map({
  basemap: "satellite",
  layers: [layer, graphicsLayer]
});

const view = new MapView({
  container: "viewDiv",
  map: map,
  zoom: 12,
  center: [-71.091, 42.331]
});
```

## Set up feature form

```javascript
const placeholder = new Graphic();

const form = new FeatureForm({
  layer,
  feature: placeholder,
  formTemplate: createFormTemplate(),
  container: document.getElementById("formDiv")
});  
  
// Returns configuration options for the FeatureForm
function createFormTemplate() {
  return new FormTemplate({
    elements: [
      new FieldElement({ fieldName: "status" })
    ]
  });
}
```

## Set up feature table

```javascript
const table = new FeatureTable({
  layer,
  view,
  editingEnabled: true,
  tableTemplate: createTableTemplate(),
  visibleElements: { header: false },
  container: document.getElementById("tableDiv")
});

function createTableTemplate() {
  return {
    columnTemplates: [
      {
        type: "field",
        fieldName: "ObjectId",
        label: "ID"
      },
      {
        type: "field",
        fieldName: "status"
      },
      {
        type: "field",
        fieldName: "notes",
        menuConfig: {
          label: "OptionsCustom",
          items: [
            {
              label: "Add Field to Form",
              iconClass: "esri-icon-right",
              autoCloseMenu: true,
              clickFunction: (info) => addFieldElementToFormTemplate("notes")
            }
          ]
        }
      },
      {
        type: "field",
        fieldName: "EditDate",
        direction: "desc",
        label: "Last Inpsection"
      },
    ]
  };
}

function addFieldElementToFormTemplate(fieldName) {
  const template = form.formTemplate.clone();

  template.elements.push(new FieldElement({ fieldName, input: new TextAreaInput() }));

  form.formTemplate = template;
}
```

## Set up sketchviewmodel

```javascript
const sketchVM = new SketchViewModel({
  layer: graphicsLayer,
  activeFillSymbol: {
    color: [0, 0, 0, 0],
    outline: {
      style: "dash-dot",
      color: [255, 140, 0],
      width: 3
    },
    type: "simple-fill"
  },
  activeVertexSymbol: {
    color: [0, 0, 0, 0],
    outline: null,
    type: "simple-marker"
  },
  vertexSymbol: {
    color: [0, 0, 0, 0],
    outline: null,
    type: "simple-marker"
  },
  view
});

// Draw selection using a "lasso" shape.
actionSelect.onclick = () => sketchVM.create("polygon", { mode: "freehand" });
```

## Wiring up selection logic

```javascript
// Select features when sketch is complete.
sketchVM.on("create", async (event) => {
if (event.state === "complete") {
  const graphic = event.graphic;

  // Remove selection Graphic immediately after drawing is complete.
  graphicsLayer.remove(graphic);

  // Query for all features contained in selection area.
  const features = await queryFeaturesByGeometry(graphic.geometry);
  const objectIds = [];

  features.forEach((feature) => {
    const oid = feature.getObjectId();

    // Only include features not already selected.
    if (!table.highlightIds.includes(oid)) {
      objectIds.push(oid);
    }
  });

  // Bulk selection
  table.highlightIds.addMany(objectIds);
}

// Returns full resolution feature from the layer
async function queryFeaturesByGeometry(geometry) {
  // Note: MapView needs to be loaded (visible) once before the layerView is 
  // available for client-side queries.
  const layerView = table.viewModel.layerView;
  const query = layerView.createQuery();
  query.outFields = [layer.objectIdField];
  query.geometry = geometry;

  const response = await layerView.queryFeatures(query);

  return response.features.length ? response.features : null;
}

});
```

## Wire up single selection
```javascript
// Selection of features via map interaction.
// Clicking on the map will highlight target features and
// select assocaited rows in the table widget.
view.when(() => {
  view.on("immediate-click", async (event) => {
    const { results } = await view.hitTest(event);
    const added = [];
    const removed = [];

    // Identify valid results.
    results.forEach(({ graphic }) => {
      if (graphic && graphic.layer === layer) {
        // Unique identifier for the graphic is required to
        // select rows in the table.
        const oid = graphic.getObjectId();

        // Determine if target is already selected and
        // if so, we want to remove it from the current selection.
        if (table.highlightIds.includes(oid)) {
          removed.push(oid);
        } else {
          added.push(oid);
        }
      }
    });

    // Bulk updates
    table.highlightIds.addMany(added);
    table.highlightIds.removeMany(removed);
  });
});
```

## Update UI based on selection changes
```javascript
reactiveUtils.on(() => table.highlightIds, "change", (event) => {
  const count = table.highlightIds.length;

  actionSave.disabled = !count;
  actionZoomToSelection.disabled = !count;
  actionClearSelectionMap.disabled = !count;
  actionClearSelectionTable.disabled = !count;
  chipSelected.innerText = count + " Selected";
});
```

## Wire up form editing
```javascript
// Causes the form to emit a 'submit' event
// with attribute updates.
actionSave.onclick = () => form.submit();

// Attempt to save changes made in the form.
form.on("submit", async (event) => {
  // Avoid saving if there are no selected records or the changes are invalid.
  // Uses client-side validation before rejection from the service.
  if (!table.highlightIds.length || !form.viewModel.submittable) {
    return;
  }

  // Prevents interaction with the table while a save is happening.
  panelTable.loading = true;

  // Reference to updated attribute values.
  const attributes = event.values;

  // Query for all features associated with selected table rows.
  const features = await queryFeaturesByOID(table.highlightIds.toArray());

  // Clone features before any updates; these can be used to perform an 'undo'.
  const clones = features.map((feature) => feature.clone());

  // Update attribute values on the features.
  features.forEach((feature) => {
    for (const key in attributes) {
      feature.attributes[key] = attributes[key];
    }
  });

  // Apply updates and store response to determine if the update was successful.
  const results = await layer.applyEdits({ updateFeatures: features });

  // Update failed. Show the appropriate UI.
  if (results.updateFeatureResults[0].error) {
    panelTable.loading = false;
    console.error("save rejected");
    return;
  }

  // Store clones in history Collection after a successful save.
  // Causes 'reactiveUtils' to update the UI accordingly.
  undoHistory.add(clones);

  // Refresh the table
  await table.refresh();

  // Re-enable table interaction.
  panelTable.loading = false;
});
```

## Wire up undo bahavior

```javascript
// Collection for storing features without any updates applied.
const undoHistory = new Collection();

// Undo previous update. Uses references to cloned features
// from before updates were applied.
actionUndo.onclick = async () => {
  panelTable.loading = true;

  const updateFeatures = undoHistory.pop();
  const results = await layer.applyEdits({ updateFeatures });

  if (results.updateFeatureResults[0].error) {
    panelTable.loading = false;
    console.error("save rejected");
    return;
  }

  await table.refresh();
  panelTable.loading = false;
};

// Update 'disabled' state of 'actionUndo' depending on if there are items in the collection (history).
reactiveUtils.on(() => undoHistory, "change", () => actionUndo.disabled = !undoHistory.length);
```
