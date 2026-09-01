export const STORAGE_PROVIDERS = [
  { code:"aliyun-oss", name:"阿里云 OSS", area:"国内", recommended:true, endpoint:"https://oss-cn-hangzhou.aliyuncs.com", region:"oss-cn-hangzhou", forcePathStyle:false },
  { code:"tencent-cos", name:"腾讯云 COS", area:"国内", endpoint:"https://cos.ap-guangzhou.myqcloud.com", region:"ap-guangzhou", forcePathStyle:false },
  { code:"huawei-obs", name:"华为云 OBS", area:"国内", endpoint:"https://obs.cn-east-3.myhuaweicloud.com", region:"cn-east-3", forcePathStyle:false },
  { code:"qiniu-kodo", name:"七牛云 Kodo", area:"国内", endpoint:"https://s3-cn-east-1.qiniucs.com", region:"cn-east-1", forcePathStyle:true },
  { code:"volc-tos", name:"火山引擎 TOS", area:"国内", endpoint:"https://tos-cn-beijing.volces.com", region:"cn-beijing", forcePathStyle:false },
  { code:"aws-s3", name:"Amazon S3", area:"海外", endpoint:"https://s3.amazonaws.com", region:"us-east-1", forcePathStyle:false },
  { code:"cloudflare-r2", name:"Cloudflare R2", area:"海外", endpoint:"https://ACCOUNT_ID.r2.cloudflarestorage.com", region:"auto", forcePathStyle:false },
  { code:"google-gcs", name:"Google Cloud Storage（S3）", area:"海外", endpoint:"https://storage.googleapis.com", region:"auto", forcePathStyle:true },
  { code:"azure-blob-s3", name:"Azure / S3 网关", area:"海外", endpoint:"", region:"auto", forcePathStyle:true },
  { code:"backblaze-b2", name:"Backblaze B2", area:"海外", endpoint:"https://s3.us-west-004.backblazeb2.com", region:"us-west-004", forcePathStyle:false },
  { code:"wasabi", name:"Wasabi", area:"海外", endpoint:"https://s3.us-east-1.wasabisys.com", region:"us-east-1", forcePathStyle:false },
  { code:"digitalocean-spaces", name:"DigitalOcean Spaces", area:"海外", endpoint:"https://nyc3.digitaloceanspaces.com", region:"nyc3", forcePathStyle:false },
  { code:"minio", name:"MinIO / 自建 S3", area:"自建", endpoint:"http://localhost:9000", region:"us-east-1", forcePathStyle:true },
] as const;

export type StorageProviderCode=(typeof STORAGE_PROVIDERS)[number]["code"];
