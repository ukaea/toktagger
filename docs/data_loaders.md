# Data Loaders

## Tabular

This data loader will load local tabular data files (e.g., CSV, parquet, etc.) using [pandas](https://pandas.pydata.org/). The data files must be accessible at the path provided. The column names will be used as the names for the signal names.

## UDA

This data loader uses [UDA](https://ukaea.github.io/UDA/) to access MAST and MAST-U data. In order for this data loader to work, you must be connected to a machine with access to one of the UDA servers. Additionally, you will need to configure the following environment variables on your system:

```bash
export UDA_HOST="uda2.mast.l"
export UDA_META_PLUGINNAME="MASTU_DB"
export UDA_METANEW_PLUGINNAME="MAST_DB"
```

## UDA Camera
This data loader uses [UDA](https://ukaea.github.io/UDA/) to access camera data from MAST and MAST-U. In order for this data loader to work, you must be connected to a machine with access to one of the UDA servers as above.

## SAL
This data loader uses [SAL](https://data.jet.uk/guides/sal/python_client.html) to access data from the JET data centre. In order for this data loader to work, you must be connected to a machine with access to the JDC or connected to the JDC VPN. Furthermore, you must have configured a local authentication details file at `~/.sal/credentials`, with contents looking the the following:

```ini
[https://sal.jetdata.eu]
user=<your-username>
password=<your-password>
```

## FAIR MAST
This data loader access data from the [FAIR MAST](https://mastapp.site) project.