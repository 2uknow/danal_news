const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 로그 디렉토리 생성
const logDir = './logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 로그 포맷 설정
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// 콘솔용 포맷
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        if (stack) {
            return `${timestamp} ${level}: ${message}\n${stack}`;
        }
        return `${timestamp} ${level}: ${message}`;
    })
);

// 로거 생성
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: { service: 'danal-news' },
    transports: [
        // 에러 로그 (별도 파일)
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true
        }),
        
        // 일반 로그
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 10,
            tailable: true
        }),
        
        // 크래시 로그 (중요한 시스템 에러)
        new winston.transports.File({
            filename: path.join(logDir, 'crash.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 3,
            tailable: true,
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
                winston.format.prettyPrint()
            )
        })
    ],
    
    // 예외 처리
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'exceptions.log'),
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3
        })
    ],
    
    // 거부된 Promise 처리
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logDir, 'rejections.log'),
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3
        })
    ]
});

// 개발 환경에서는 콘솔에도 출력
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
    }));
}

// 헬퍼 함수들
const logHelper = {
    // 시스템 시작
    systemStart: () => {
        logger.info('=== 다날 뉴스 모니터링 시스템 시작 ===', {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform
        });
    },
    
    // 시스템 종료
    systemStop: (reason = 'normal') => {
        logger.info('=== 다날 뉴스 모니터링 시스템 종료 ===', {
            reason,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    },
    
    // 자산 모니터링 시작
    monitoringStart: (assetsCount) => {
        logger.info('모니터링 사이클 시작', {
            assetsCount,
            timestamp: new Date().toISOString()
        });
    },
    
    // 자산 모니터링 완료
    monitoringComplete: (duration, assetsProcessed) => {
        logger.info('모니터링 사이클 완료', {
            duration: `${duration}ms`,
            assetsProcessed,
            timestamp: new Date().toISOString()
        });
    },
    
    // 뉴스 발견
    newsFound: (asset, newsCount) => {
        logger.info('새로운 뉴스 발견', {
            asset: asset.name,
            newsCount,
            timestamp: new Date().toISOString()
        });
    },
    
    // 알림 발송
    notificationSent: (type, success, message) => {
        if (success) {
            logger.info('알림 발송 성공', {
                type,
                messageLength: message?.length || 0,
                timestamp: new Date().toISOString()
            });
        } else {
            logger.error('알림 발송 실패', {
                type,
                error: message,
                timestamp: new Date().toISOString()
            });
        }
    },
    
    // 네트워크 에러
    networkError: (url, error, attempt = 1) => {
        logger.error('네트워크 요청 실패', {
            url,
            error: error.message,
            stack: error.stack,
            attempt,
            timestamp: new Date().toISOString()
        });
    },
    
    // 메모리 경고
    memoryWarning: (memoryMB, threshold) => {
        logger.warn('메모리 사용량 경고', {
            memoryMB,
            threshold,
            memoryDetail: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    },
    
    // 크래시 리포트
    crashReport: (error, context = {}) => {
        logger.error('시스템 크래시', {
            error: error.message,
            stack: error.stack,
            context,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    },
    
    // 성능 메트릭
    performance: (operation, duration, details = {}) => {
        const level = duration > 10000 ? 'warn' : 'info'; // 10초 이상이면 경고
        logger[level]('성능 메트릭', {
            operation,
            duration: `${duration}ms`,
            ...details,
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = {
    logger,
    logHelper
};