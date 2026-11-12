import "server-only";
import modelJson from "../models/phishing-email-model.v1.json";
import type { SecurityAnalysis } from "@/lib/securityAnalyzer";

interface LogisticRegressionEstimator {
  kind: "logistic_regression";
  coef: number[];
  intercept: number;
}

interface MultinomialNaiveBayesEstimator {
  kind: "multinomial_nb";
  featureLogProb: number[][];
  classLogPrior: number[];
}

interface EmailClassifierArtifact {
  schemaVersion: number;
  modelVersion: string;
  training: {
    vectorizer: {
      tokenPattern: string;
      ngramRange: number[];
      norm: "l2";
    };
    estimator: LogisticRegressionEstimator | MultinomialNaiveBayesEstimator;
    featureNames: string[];
    idf: number[];
    threshold: number;
    hybridRuleCutoff: number;
    legitimateOtpSuppression: boolean;
  };
}

const model = modelJson as EmailClassifierArtifact;
if (
  model.schemaVersion !== 1
  || model.training.featureNames.length !== model.training.idf.length
  || model.training.threshold < 0
  || model.training.threshold > 1
) {
  throw new Error("The phishing email model artifact is invalid.");
}

const TOKEN_PATTERN = new RegExp("[\\p{L}\\p{N}_]{2,}", "gu");
const featureIndexes = new Map(
  model.training.featureNames.map((feature, index) => [feature, index])
);

function tfidfFeatures(text: string): Array<[number, number]> {
  const tokens = text.toLowerCase().match(TOKEN_PATTERN) || [];
  const termCounts = new Map<string, number>();
  const add = (term: string) => termCounts.set(term, (termCounts.get(term) || 0) + 1);
  for (let index = 0; index < tokens.length; index += 1) {
    add(tokens[index]);
    if (index > 0) add(`${tokens[index - 1]} ${tokens[index]}`);
  }

  const weighted: Array<[number, number]> = [];
  let normSquared = 0;
  termCounts.forEach((count, term) => {
    const featureIndex = featureIndexes.get(term);
    if (featureIndex === undefined) return;
    const value = count * model.training.idf[featureIndex];
    weighted.push([featureIndex, value]);
    normSquared += value * value;
  });

  if (normSquared === 0) return [];
  const inverseNorm = 1 / Math.sqrt(normSquared);
  return weighted.map(([index, value]) => [index, value * inverseNorm]);
}

/** Match the saved scikit-learn TF-IDF estimator's positive-class probability. */
export function predictPhishingProbability(text: string): number {
  const features = tfidfFeatures(text);
  const estimator = model.training.estimator;
  if (estimator.kind === "logistic_regression") {
    let decision = estimator.intercept;
    for (const [index, value] of features) decision += estimator.coef[index] * value;
    if (decision >= 0) return 1 / (1 + Math.exp(-decision));
    const exp = Math.exp(decision);
    return exp / (1 + exp);
  }

  let safeScore = estimator.classLogPrior[0];
  let phishingScore = estimator.classLogPrior[1];
  for (const [index, value] of features) {
    safeScore += estimator.featureLogProb[0][index] * value;
    phishingScore += estimator.featureLogProb[1][index] * value;
  }
  const maxScore = Math.max(safeScore, phishingScore);
  const safeProbability = Math.exp(safeScore - maxScore);
  const phishingProbability = Math.exp(phishingScore - maxScore);
  return phishingProbability / (safeProbability + phishingProbability);
}

/** Combine the selected model with existing rules without auto-quarantining model-only hits. */
export function applyEmailClassifier(
  text: string,
  rules: SecurityAnalysis
): SecurityAnalysis {
  const probability = predictPhishingProbability(text);
  const isLegitimateOtp = rules.category === "LEGITIMATE_OTP";
  if (
    probability < model.training.threshold
    || isLegitimateOtp
    || rules.riskScore >= 55
  ) {
    return rules;
  }

  return {
    ...rules,
    riskScore: 55,
    riskLevel: "REVIEW",
    category: "ML_PHISHING",
    reasons: [
      ...rules.reasons,
      `Version ${model.modelVersion} phishing model raised this email for review.`,
    ].slice(0, 8),
  };
}

export const EMAIL_CLASSIFIER_INFO = {
  modelVersion: model.modelVersion,
  threshold: model.training.threshold,
  estimator: model.training.estimator.kind,
} as const;
