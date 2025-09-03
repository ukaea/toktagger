from sal.client import SALClient

sal = SALClient("https://sal.jetdata.eu")
print(sal.credentials_file)
# sal._clear_auth_token()
ip = sal.get("/pulse/87737/ppf/signal/jetppf/magn/ipla")
print(ip.data)
print(ip.dimensions[0].data)


# plt.plot(ip.dimensions[0].data, ip.data)
# plt.show()
