### Web Application
The UI is designed to be run as a web application. This was chosen for a number of reason:

* End users will not need to install any software onto their local machine, making deployment and updates far easier
* Many frameworks exist to support the creation of web applications
* Web application development is a skill widely available in industry so onboarding new starters into the project should be easier

### Framework
The UI currently makes use of the [NextJS](https://nextjs.org/) framework to create the web application. Frameworks such as NextJS handles a number of key philosophies with little to no developer interaction required:

* Routing - allowing for the movement between pages hosted by the web application
* Client and server-side rendering
* Resource bundling and caching

### Why NextJS?
Whilst multiple frameworks exist for creating web applications NextJS was selected as it is one of the most widely used frameworks in industry with good levels of documentation. It also is built on top of React which is a very easy to use framework for creating JavaScript/TypeScript user interfaces and is very well documented with a very large user base. Additionally, NextJS is well-known for its easy to use server-side rendering, which the project aimed to make use of to help make the web application as responsive as possible.