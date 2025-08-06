This provider exposes a context which allows for the generation of a general context menu to be attached to a plot. The purpose of this context menu is to allow the user to interact with the plot such as adding tooling for example.

The context exposes two properties for children to interact with:

1. `registerMenuItem` - a function that can be called by children in order to register an item to be added to the main context menu
2. `show` - a function that children can call to trigger the display of the context menu. The children must also pass props to the context menu through this function (see below)

The context menu provider should be placed so as to be the parent of any linked tooling providers and plots. This means that the tooling components have access to the context menu provider in order to register the menu items that relate to that tool and the plots have access to the `show` command so that a context menu listener can be attached to the plot.

An example of a setup would be:
```
<ContextMenuProvider menuId="disruption-menu">
   <VSpanProvider categories={disruptionCategories} initialData={initialDisruption}>
      <ZoneProvider categories={zoneCategories} initialData={initialZones}>
         <DisruptionPlot data={data} zoneCategories={zoneCategories} disruptionCategory={disruptionCategories[0]}/>
         <DisruptionTable />
      </ZoneProvider>
   </VSpanProvider>
</ContextMenuProvider>
``` 

It can be seen that the context menu is the parent of the VSpan and zone tooling as well as the plot.

### Context Menu Props
When the `show` command is called, props can be passed to the context menu to provide parameters to the callbacks attached to the menu items. This is important as tooling is usually inserted where the user initiated the context menu from with a right-click.

Currently, these props have not been standardised. However it is proposed that the following props be made the standard:

* The x position of the click w.r.t the plots coordinate system
* The y position of the click w.r.t the plots coordinate system
* The number of pixels that represent one unit on the x-axis
* The number of pixels that represent one unit on the y-axis

The reason for including the scaling is to allow tooling component to generate certain width geometry. The alternative is to pass the current axis range to the context menu instead