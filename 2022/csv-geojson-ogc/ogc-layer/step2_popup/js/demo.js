require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/WFSLayer"
], (Map, MapView, WFSLayer) => {
  // *** create a PopupTemplate and configure an aracade expression
  
  // initialize a WFSLayer
  const droughtWFSLayer = new WFSLayer({
    url: "https://idpgis.ncep.noaa.gov/arcgis/services/NWS_Climate_Outlooks/cpc_drought_outlk/MapServer/WFSServer",
    name: "Seasonal_Drought_Outlook",
    title: "US Seasonal Drought Outlook (Feb - May 2022)",
    copyright: "NOAA/NWS/NCEP/Climate Prediction Center",
    outFields: ['*'],
    // *** add popupTemplate
  });

  // add the WFSLayer to the map
  const map = new Map({
    basemap: "gray-vector",
    layers: [droughtWFSLayer]
  });

  // initialize the view with an extent
  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [-100, 34],
    zoom: 4
  });
    
});