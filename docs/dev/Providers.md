The user interface makes heavy use of React's [contexts](https://react.dev/reference/react/createContext#provider). The linked documentation provides good reference material however as a general overview, these contexts provide child components with access to shared data. This is useful as it allows for data to be shared between multiple plots.

The user interface exposes multiple providers, which expose contexts used for various functions. The providers implemented can be found [here](https://github.com/ukaea/viz-annotation/tree/main/services/ui/src/app/components/providers). With additional information included in the following pages:

* [Context Menu Provider](Context-Menu-Provider.md)
* Tooling Provider