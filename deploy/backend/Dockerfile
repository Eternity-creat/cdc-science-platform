# ╔══════════════════════════════════════════════════════════╗
# ║  CDC Backend — Spring Boot 4 + Java 21                 ║
# ║  多阶段构建：Maven 编译 → JRE 运行时                    ║
# ╚══════════════════════════════════════════════════════════╝

# ── 第一阶段：Maven 构建 ──
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /build

# 先复制 pom，利用 Docker 缓存加速依赖下载
COPY pom.xml .
RUN mvn dependency:go-offline -B

# 复制源码并打包
COPY src ./src
RUN mvn clean package -DskipTests -B

# ── 第二阶段：JRE 运行时 ──
FROM eclipse-temurin:21-jre-alpine

LABEL maintainer="CDC Platform"
LABEL description="CDC 科普文章生成平台 — Java Backend"

WORKDIR /app

# 创建非 root 用户
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 安装 curl（健康检查用）
RUN apk add --no-cache curl

# 创建上传目录（wiki 导入、文件上传）并赋权给 appuser
RUN mkdir -p /app/uploads/wiki && chown -R appuser:appgroup /app/uploads

# 从构建阶段复制 JAR
COPY --from=builder /build/target/*.jar app.jar

# 切换用户
USER appuser

EXPOSE 8080

# JVM 优化参数 + Spring Boot 启动
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", "app.jar"]
