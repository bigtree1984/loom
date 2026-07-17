# アイコンの追加方法

公式サイトなどからダウンロードしたSVGをこのフォルダに置き、ファイル名（拡張子抜き）をLoom JSONの `architecture.nodes[].icon` にそのまま指定する。

例: `aws-s3.svg` を置いたら `"icon": "aws-s3"`。

ファイルがまだ無いキーを指定した場合は、アイコン無し（ドット＋ラベルのみ）として表示されるので、途中まで揃っていても壊れない。

命名の目安:
- AWS: `aws-{service}`（例: `aws-s3`, `aws-lambda`, `aws-ec2`, `aws-api-gateway`, `aws-dynamodb`, `aws-cloudfront`）— AWS公式Asset Package (`Architecture-Service-Icons_*/Arch_*/48/`) から
- GCP: `gcp-{service}`（例: `gcp-bigquery`, `gcp-cloud-storage`）— Google公式アイコンパックから
- Azure: `azure-{service}`（例: `azure-storage-account`, `azure-functions`, `azure-app-service`）— Microsoft Learn配布の「Azure Architecture Icons」ZIPパックから
- 汎用技術: そのままの名前（例: `python`, `flask`, `react`, `postgresql`）— [simple-icons](https://simpleicons.org/)（MITライセンス）から採取。単色ロゴなのでダークモードで見えなくなるのを防ぐため`fill="#8a887f"`を焼き込み済み。AWS/GCP/Azureの公式フルカラーアイコンは加工せずそのまま置く。

現在揃っているのは上記の「定番スターターセット」のみ。他のサービスが必要になったら、ダウンロード済みのZIPパックから同じ命名規則で追加できる。
