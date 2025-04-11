# Running Signalk in Docker and kubernetes

Signalk-server can run in Docker and kubernetes. The following steps provide a guide on how to build an up-to-date Docker image, run it locally on Docker and eventually deploy it to kubernetes.

## Preparations
Checkout the Signalk source:
```shell
$ git clone https://github.com/SignalK/signalk-server-node.git
$ cd signalk-server-node
```

## Docker
First we build a Docker image with the name "signalk":

```shell
$ docker build -t signalk .
```

Then we can run it:
```shell
$ docker run --publish 3100:3000 --name signalk signalk
```

This will start a container named `signalk` from the image `signalk` that is accessible on http://localhost:3000.

The container runs with `--securityenabled`, which means you'll have to login. Signalk-server allows you to specify the admin user and a password when you first log in.

## Kubernetes
Once the Docker image has been made, it can be deployed to Kubernetes.

For this we first tag the Docker image so we can upload it to a remote registy. E.g:

```shell
$ docker tag signalk gcr.io/wouterdebie-personal/signalk
```

The format for the tag is `<REGISTRY>/<PROJECT>/<APPLICATION>`

After that we can push the image to the registry:
```shell
$ docker push gcr.io/wouterdebie-personal/signalk
```

Edit `kubernetes/signalk-deployment.yaml` and set the correct image that is supposed to be used. (Default is `signalk/signalk-server:master`)

Once the image is pushed, we can deploy the application (this assumes kubernetes is properly setup):

```shell
$ kubectl create -f kubernetes/signalk-deployment.yaml
```

This deployment specification does a few things:
- It creates a `PersistentVolumeClaim`, that is used to store the server configuration. A persistent volume is mounted at `~/.signalk`.
- It creates a `Pod` and starts a container running the application.
- It creates a `Service` that exposes the application on a public IP on port 80.

To check the external IP of the application:
```shell
$ kubectl get service
NAME         TYPE           CLUSTER-IP    EXTERNAL-IP    PORT(S)        AGE
kubernetes   ClusterIP      10.12.0.1     <none>         443/TCP        27h
signalk      LoadBalancer   10.12.12.44   <EXTERNAL_IP>  80:31381/TCP   26m
```

Test your setup by going to http://<EXTERNAL_IP>
